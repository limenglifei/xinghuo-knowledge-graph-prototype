/* 四步抽取任务原型：选择目标 → 配置策略 → 选择资料 → 确认置信度分流。 */
(() => {
  'use strict';
  const K = window.KG, $ = K.$, escape = K.escape;
  const stepNames = ['选择抽取目标', '配置抽取策略', '选择抽取范围', '设置分流并创建'];
  const scopeNames = { source:'知识库', document:'文档' };
  const kindNames = { entity:'实体', relation:'关系', property:'属性' };
  const state = { initialized:false, draft:null, step:1, initial:'', nameEdited:false, scopes:{source:[],document:[]}, documentSearch:'', creating:false, created:false, session:0 };
  const X = () => K.extract;
  const defaultStrategy = () => ({mode:'llm',model:'DeepSeek',instruction:'',rule:'关键词匹配',keywords:''});
  const allElements = () => state.draft?.ontologyId ? X().elements(state.draft.ontologyId) : [];
  const selectableElements = () => allElements().filter(item => item.kind !== 'property');
  const selectedElements = () => selectableElements().filter(item => state.draft.targetIds.includes(item.id));
  const propertiesOf = item => allElements().filter(property => property.parentId === item.id && property.kind === 'property');
  const checked = value => value ? ' checked' : '';
  const option = (value, label, current) => `<option value="${escape(value)}"${value === current ? ' selected' : ''}>${escape(label)}</option>`;

  /** 预填内容作为初始基线，只有用户修改后的未创建内容需要放弃确认。 */
  function hasUnsavedChanges() {
    return Boolean($('extractionWizard')?.open && state.draft && !state.created && JSON.stringify(state.draft) !== state.initial);
  }

  function setError(message = '', focus = false) {
    $('extractionError').textContent = message;
    $('extractionError').hidden = !message;
    if (!message || !focus) return;
    $('extractionError').tabIndex = -1;
    $('extractionError').focus();
    $('extractionError').scrollIntoView({block:'nearest'});
  }

  /** 普通入口默认选择首个可用发布版；推荐入口仍允许用户逐步复核配置。 */
  function open(options = {}) {
    if ($('extractionWizard').open) return;
    const available = X().ontologies();
    const preferred = available.find(item => item.id === options.ontologyId) || available[0];
    const draft = options.recommendationId ? X().recommendedDraft(options.recommendationId) : X().newDraft(options.ontologyId || preferred?.id);
    if (!draft) { K.notify('该补充建议当前不可创建任务，请刷新任务列表后查看。'); return; }
    state.draft = K.clone(draft);
    state.step = 1;
    state.nameEdited = Boolean(options.recommendationId && draft.name);
    state.scopes = {source:[],document:[]};
    state.scopes[draft.scope.mode] = [...draft.scope.ids];
    state.documentSearch = '';
    state.creating = false;
    state.created = false;
    state.session += 1;
    ensureStrategies();
    suggestName();
    state.initial = JSON.stringify(state.draft);
    $('extractionWizardTitle').textContent = options.recommendationId ? '创建补充抽取任务' : '创建抽取任务';
    render();
    $('extractionWizard').showModal();
  }

  function closeNow() {
    state.session += 1;
    $('extractionWizard').close();
  }

  function requestClose(afterClose) {
    if (state.creating) return;
    const session = state.session;
    const action = () => { if (session !== state.session) return; closeNow(); if (afterClose) afterClose(); };
    if (!hasUnsavedChanges()) { action(); return; }
    K.confirm({title:'放弃本次任务配置？',text:'尚未创建的抽取任务配置将不予保留，已有任务不受影响。',label:'放弃配置',danger:true,action});
  }

  function ensureStrategies() {
    state.draft.targetIds.forEach(id => { if (!state.draft.strategies[id]) state.draft.strategies[id] = defaultStrategy(); });
  }

  /** 默认任务名跟随勾选目标，用户开始编辑名称后不再自动覆盖。 */
  function suggestName() {
    if (state.nameEdited) return;
    const targets = selectedElements();
    const ontology = X().ontologies().find(item => item.id === state.draft.ontologyId);
    if (!ontology) { state.draft.name = ''; return; }
    const first = targets[0];
    const label = first ? first.name + kindNames[first.kind] + (targets.length > 1 ? '等' + targets.length + '项' : '') : ontology.name + '知识';
    const date = new Date();
    state.draft.name = `${label.slice(0, 36)}抽取-${date.getFullYear()}Q${Math.floor(date.getMonth() / 3) + 1}`.slice(0, 50);
  }

  function render() {
    setError();
    $('extractionSteps').innerHTML = stepNames.map((label,index) => `<span class="ex-step ${state.step === index + 1 ? 'active' : state.step > index + 1 ? 'done' : ''}"${state.step === index + 1 ? ' aria-current="step"' : ''}><b>${state.step > index + 1 ? '✓' : index + 1}</b>${label}</span>`).join('');
    const renderers = [renderTargets, renderStrategies, renderScope, renderRouting];
    $('extractionStepBody').innerHTML = renderers[state.step - 1]();
    const scrollArea = $('extractionWizard').querySelector('.ex-wizard-scroll');
    if (scrollArea) scrollArea.scrollTop = 0;
    $('extractionPrev').hidden = state.step === 1;
    $('extractionNext').hidden = state.step === 4;
    $('createExtractionTask').hidden = state.step !== 4;
    $('extractionStepHint').textContent = `第 ${state.step} 步，共 4 步 · 创建前可返回调整`;
    refreshControls();
    if (state.step === 3) renderScopeResults();
  }

  function renderTargets() {
    const ontologies = X().ontologies();
    if (!ontologies.length) return '<div class="ex-empty"><h3>暂无可用于抽取的本体</h3><p>请先完成本体发布并启用，再创建抽取任务。</p><button class="btn" type="button" data-ex-action="modeling">前往本体建模</button></div>';
    const unavailable = !ontologies.some(item => item.id === state.draft.ontologyId);
    const options = (unavailable ? '<option value="" disabled selected>原本体已不可用，请重新选择</option>' : '') + ontologies.map(item => option(item.id, `${item.name} · v${item.version}`, state.draft.ontologyId)).join('');
    return `<p class="ex-step-intro">选择需要抽取的实体和关系，全部属性随目标一并抽取，无需逐项选择。</p><div class="ex-form-grid"><label class="ex-field">选择本体<select id="exOntology" data-ex-field="ontology">${options}</select></label><label class="ex-field">任务名称<input id="exTaskName" data-ex-field="name" maxlength="50" value="${escape(state.draft.name)}" placeholder="根据抽取目标命名任务"></label></div><div class="ex-target-toolbar"><strong>抽取目标 <span class="help">已选择 ${state.draft.targetIds.length} 项</span></strong><span><button class="link-btn" type="button" data-ex-action="select-all">全选</button><button class="link-btn" type="button" data-ex-action="clear-all">清除</button></span></div><p class="help">仅展示已发布并启用的本体。子类型包含继承属性，父子类型可独立选择。</p><div class="ex-target-tree">${targetGroup('entities','实体类型')}${targetGroup('relations','关系类型')}</div>`;
  }

  function targetCheckbox(item) {
    const properties = propertiesOf(item);
    return `<label class="ex-check-row ex-target-parent" title="${escape(item.label)}"><input type="checkbox" data-ex-target="${escape(item.id)}"${checked(state.draft.targetIds.includes(item.id))}><span>${escape(item.kind === 'relation' ? item.label : item.name)}<small class="ex-auto-properties">${properties.length ? '自动抽取全部 ' + properties.length + ' 项属性' : '暂无定义属性'}</small></span></label>`;
  }

  function targetGroup(group, title) {
    const elements = selectableElements().filter(item => item.group === group);
    const parents = elements;
    const ordered = group === 'entities' ? treeOrder(parents) : parents;
    const rows = ordered.map(item => `<div data-tree-depth="${item.depth || 1}" style="--tree-depth:${item.depth || 1}">${targetCheckbox(item)}</div>`).join('');
    return `<section class="ex-target-group"><div class="ex-section-title"><h3>${title}</h3>${elements.length ? `<button class="link-btn" type="button" data-ex-group="${group}">选择本组全部</button>` : ''}</div>${rows || '<p class="help">当前本体暂无此类定义。</p>'}</section>`;
  }

  /** 父子类型按已发布层级呈现，勾选仍独立，不强制把子类一并选入。 */
  function treeOrder(parents,parentId = null,depth = 1) {
    if (depth > 5) return [];
    return parents.filter(item => (item.parentTypeId || null) === parentId).flatMap(item =>
      [item,...treeOrder(parents,item.id.slice('entity:'.length),depth + 1)]);
  }

  function renderStrategies() {
    return `<p class="ex-step-intro">为每个目标选择抽取方式，其全部属性使用相同策略。返回修改目标后，已配置的内容会保留。</p><div class="ex-strategy-list">${selectedElements().map(strategyCard).join('')}</div>`;
  }

  function strategyCard(item) {
    const strategy = state.draft.strategies[item.id];
    const selector = `<select data-ex-strategy="mode" data-id="${escape(item.id)}" aria-label="${escape(item.label)}抽取方式">${option('llm','大模型抽取',strategy.mode)}${option('rule','规则抽取',strategy.mode)}</select>`;
    return `<section class="ex-strategy-card" data-strategy-card="${escape(item.id)}"><div class="ex-strategy-head"><div><strong>${escape(item.label)}</strong><span class="ex-kind">${kindNames[item.kind]}</span></div>${selector}</div><div class="ex-strategy-fields">${strategy.mode === 'rule' ? ruleFields(item,strategy) : modelFields(item,strategy)}</div></section>`;
  }

  function modelFields(item, strategy) {
    const id = escape(item.id);
    return `<label class="ex-field">补充要求 <span class="help">选填</span><textarea data-ex-strategy="instruction" data-id="${id}" rows="2" maxlength="600" placeholder="例如：保留原文名称，优先抽取明确提及的内容">${escape(strategy.instruction)}</textarea></label>`;
  }

  function ruleFields(item, strategy) {
    const id = escape(item.id), regular = strategy.rule === '正则表达式';
    return `<label class="ex-field">匹配方式<select data-ex-strategy="rule" data-id="${id}">${option('关键词匹配','关键词匹配',strategy.rule)}${option('正则表达式','正则表达式',strategy.rule)}</select></label><label class="ex-field">${regular ? '匹配表达式' : '匹配关键词'} <span class="required">*</span><textarea data-ex-strategy="keywords" data-id="${id}" rows="2" maxlength="600" placeholder="${regular ? '填写已有的匹配表达式' : '填写关键词，多个词可用逗号分隔'}">${escape(strategy.keywords)}</textarea></label><p class="help">${regular ? '适合已有固定格式规则的资料。可请熟悉资料格式的同事协助填写。' : '适合术语固定、名称明确的资料。'}</p>`;
  }

  function renderScope() {
    const scope = state.draft.scope;
    const tabs = Object.entries(scopeNames).map(([mode,label]) => `<button type="button" class="ex-scope-tab ${mode === scope.mode ? 'active' : ''}" data-ex-scope="${mode}" aria-pressed="${mode === scope.mode}">${label}</button>`).join('');
    const placeholder = scope.mode === 'source' ? '请输入知识库名称' : '搜索文档标题或所属知识库';
    return `<p class="ex-step-intro">选择知识库抽取其中的全部文档，或直接选择具体文档。</p><div class="ex-scope-picker"><div class="ex-scope-tabs" role="group" aria-label="抽取范围选择方式">${tabs}</div><input type="search" data-ex-scope-search maxlength="100" value="${escape(state.documentSearch)}" placeholder="${placeholder}" aria-label="${placeholder}"><div id="exScopeList" class="ex-scope-card-grid">${scopeRows()}</div><div class="ex-scope-selection"><span id="exScopeSelectedCount"></span><button type="button" class="link-btn" data-ex-action="clear-scope">清空选择</button></div></div><p class="help">两种方式的选择分别保留，本次仅使用当前页签的选择，重复文档只处理一次。</p><div id="exScopeResults" class="ex-scope-result" aria-live="polite"></div>`;
  }

  /** 知识库与文档共用卡片选择，筛选不清除已有勾选。 */
  function scopeRows() {
    const query = state.documentSearch.trim().toLowerCase();
    const isLibrary = state.draft.scope.mode === 'source';
    const entries = isLibrary ? X().sources : X().documents;
    return entries.filter(item => ((item.name || item.title) + ' ' + (item.sourceName || '')).toLowerCase().includes(query)).map(item => {
      const title = isLibrary ? item.name : item.title;
      const meta = isLibrary ? '共 ' + X().documents.filter(document => document.sourceId === item.id).length + ' 个文档' : item.sourceName + ' · ' + item.pages + ' 页';
      return `<label class="ex-scope-card"><span class="ex-file-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/></svg></span><span class="ex-scope-card-copy"><strong>${escape(title)}</strong><small>${escape(meta)}</small></span><input type="checkbox" data-ex-scope-id="${escape(item.id)}" aria-label="选择${escape(title)}"${checked(state.draft.scope.ids.includes(item.id))}></label>`;
    }).join('') || '<p class="ex-empty">暂无匹配结果，试试其他关键词。已有选择仍会保留。</p>';
  }

  function scopeDocuments() { return X().resolveDocuments(state.draft.scope); }

  function currentEstimate() {
    return X().estimate(scopeDocuments().map(item => item.id),state.draft.targetIds,state.draft.strategies);
  }

  function estimateMarkup(estimate,documentLabel = '待处理文档') {
    return `<div class="ex-estimate"><div class="ex-estimate-item"><span>${escape(documentLabel)}</span><strong>${estimate.documents} 份</strong></div><div class="ex-estimate-item"><span>合计页数</span><strong>${estimate.pages} 页</strong></div><div class="ex-estimate-item"><span>预计耗时</span><strong>约 ${estimate.minutes} 分钟</strong></div></div><p class="help">预计耗时仅供参考，以实际处理情况为准。</p>`;
  }

  function renderScopeResults() {
    const documents = scopeDocuments();
    const estimate = currentEstimate();
    $('exScopeSelectedCount').textContent = '已选 ' + state.draft.scope.ids.length + (state.draft.scope.mode === 'source' ? ' 个知识库' : ' 份文档');
    // 文档数按当前选择方式解析并去重，与最终任务采用相同范围；两步均不展示费用。
    $('exScopeResults').innerHTML = documents.length ? `<strong>本次抽取范围</strong>${estimateMarkup(estimate,'文档数')}` : '<p>文档数：0 份。勾选知识库或文档后，可预览本次抽取范围。</p>';
    refreshControls();
  }

  function renderRouting() {
    const routing = state.draft.routing;
    return `<p class="ex-step-intro">所有抽取目标共用一套分流规则。高分进入融合候选，中分交人工复核，低分暂不采纳。</p><section><h3 class="ex-section-title">置信度分流规则</h3>${thresholdFields(routing)}<div class="ex-routing-bands" data-band-for="global">${routingBands(routing)}</div></section>${summaryMarkup()}`;
  }

  function thresholdFields(values) {
    return `<div class="ex-threshold-inputs"><label class="ex-field">高可信度起点<input type="number" min="1" max="100" step="1" data-ex-threshold="high" value="${escape(values.high)}" aria-label="高可信度起点"><span class="help">% 及以上</span></label><label class="ex-field">人工复核起点<input type="number" min="1" max="99" step="1" data-ex-threshold="medium" value="${escape(values.medium)}" aria-label="人工复核起点"><span class="help">% 及以上且低于高可信度起点</span></label></div>`;
  }

  function routingBands(values) {
    const {high,medium} = values;
    if (!Number.isFinite(high) || !Number.isFinite(medium) || medium <= 0 || high > 100 || high <= medium) return '<p class="help">请设置大于 0、不超过 100 的分数，且高可信度起点大于人工复核起点。</p>';
    return `<div class="high"><strong>高可信度 · ${high}%–100%</strong><span>进入融合候选</span></div><div class="medium"><strong>中可信度 · ${medium}%（含）至 ${high}%（不含）</strong><span>待人工复核</span></div><div class="low"><strong>低可信度 · 0%（含）至 ${medium}%（不含）</strong><span>暂不采纳</span></div>`;
  }

  function summaryMarkup() {
    const ontology = X().ontologies().find(item => item.id === state.draft.ontologyId);
    const elements = selectedElements();
    const counts = ['entity','relation'].map(kind => `${elements.filter(item => item.kind === kind).length} 个${kindNames[kind]}`).join('、');
    const propertyCount = elements.reduce((total,item) => total + propertiesOf(item).length,0);
    return `<section class="ex-summary"><h3 class="ex-section-title">任务确认</h3><dl><dt>任务名称</dt><dd>${escape(state.draft.name)}</dd><dt>使用本体</dt><dd>${escape(ontology?.name || '本体已不可用')} · v${escape(state.draft.version)}</dd><dt>抽取目标</dt><dd>${counts}，自动包含全部 ${propertyCount} 项属性</dd><dt>资料范围</dt><dd>${scopeNames[state.draft.scope.mode]} · 已选择 ${state.draft.scope.ids.length} 项</dd></dl>${estimateMarkup(currentEstimate())}<p class="notice">创建后可在右上角「抽取任务记录」查看进度。本体看板展示抽取结果，不会直接写入正式图谱。</p></section>`;
  }

  function refreshControls() {
    const available = X().ontologies().some(item => item.id === state.draft?.ontologyId);
    $('extractionNext').disabled = state.creating || !available || (state.step === 3 && !scopeDocuments().length);
    $('createExtractionTask').disabled = state.creating || state.created || !available || !scopeDocuments().length;
    $('createExtractionTask').textContent = state.creating ? '正在创建…' : '创建抽取任务';
    $('extractionPrev').disabled = state.creating;
  }

  /** 去选目标时同步清除其策略，避免隐藏配置影响任务。 */
  function updateTargets(ids) {
    const allowed = new Set(selectableElements().map(item => item.id));
    state.draft.targetIds = [...new Set(ids)].filter(id => allowed.has(id));
    Object.keys(state.draft.strategies).forEach(id => { if (!state.draft.targetIds.includes(id)) delete state.draft.strategies[id]; });
    ensureStrategies();
    suggestName();
    render();
  }

  function changeOntology(id) {
    if (id === state.draft.ontologyId) return;
    const session = state.session;
    const apply = () => {
      if (session !== state.session) return;
      state.draft = X().newDraft(id);
      state.nameEdited = false;
      state.scopes = {source:[],document:[]};
      state.documentSearch = '';
      suggestName();
      render();
    };
    $('exOntology').value = state.draft.ontologyId;
    const hasConfiguration = state.draft.targetIds.length || state.draft.scope.ids.length || hasUnsavedChanges() || state.draft.recommendationId;
    if (!hasConfiguration) { apply(); return; }
    K.confirm({title:'切换本体？',text:'切换后将重新选择抽取目标，并清除本任务的策略、资料范围和分流配置。',label:'确认切换',action:apply});
  }

  function next() {
    if (state.creating) return;
    const error = X().validate(state.draft,state.step);
    if (error) { setError(error,true); return; }
    state.step = Math.min(4,state.step + 1);
    render();
  }

  /** 最终提交再次逐步校验，定位首个问题；同步防重入避免重复创建。 */
  function createTask() {
    if (state.creating || state.created || state.step !== 4) return;
    for (let step = 1; step <= 4; step += 1) {
      const error = X().validate(state.draft,step);
      if (error) { state.step = step; render(); setError(error,true); return; }
    }
    state.creating = true;
    refreshControls();
    try {
      const result = X().createTask(K.clone(state.draft));
      if (result.error || !result.task) { setError(result.error || '任务暂未创建，请核对配置后重试。',true); return; }
      state.created = true;
      closeNow();
      K.navigateGraph('extraction',result.task.ontologyId);
      K.notify('抽取任务已创建，可在右上角「抽取任务记录」查看进度。');
    } catch (error) {
      setError('暂时无法创建任务，请重试。当前配置已保留。',true);
    } finally {
      state.creating = false;
      refreshControls();
    }
  }

  function switchScope(mode) {
    if (!scopeNames[mode] || mode === state.draft.scope.mode) return;
    state.scopes[state.draft.scope.mode] = [...state.draft.scope.ids];
    state.draft.scope = {mode,ids:[...state.scopes[mode]]};
    state.documentSearch = '';
    render();
  }

  function changeScopeSelection(id, isChecked) {
    const ids = new Set(state.draft.scope.ids);
    if (isChecked) ids.add(id); else ids.delete(id);
    state.draft.scope.ids = [...ids];
    state.scopes[state.draft.scope.mode] = [...ids];
    setError();
    renderScopeResults();
  }

  function updateThreshold(input) {
    const values = state.draft.routing;
    values[input.dataset.exThreshold] = input.value === '' ? null : Number(input.value);
    const band = $('extractionStepBody').querySelector('[data-band-for="global"]');
    if (band) band.innerHTML = routingBands(values);
    setError();
  }

  function handleInput(event) {
    const input = event.target;
    if (input.dataset.exField === 'name') { state.draft.name = input.value; state.nameEdited = true; setError(); }
    if (input.hasAttribute('data-ex-scope-search')) {
      state.documentSearch = input.value;
      $('exScopeList').innerHTML = scopeRows();
    }
    if (input.dataset.exStrategy && input.tagName !== 'SELECT') {
      state.draft.strategies[input.dataset.id][input.dataset.exStrategy] = input.value;
      setError();
    }
    if (input.dataset.exThreshold) updateThreshold(input);
  }

  function handleChange(event) {
    const input = event.target;
    if (input.dataset.exField === 'ontology') changeOntology(input.value);
    if (input.dataset.exTarget) {
      const ids = new Set(state.draft.targetIds);
      if (input.checked) ids.add(input.dataset.exTarget); else ids.delete(input.dataset.exTarget);
      updateTargets([...ids]);
    }
    if (input.dataset.exStrategy && input.tagName === 'SELECT') {
      state.draft.strategies[input.dataset.id][input.dataset.exStrategy] = input.value;
      render();
    }
    if (input.hasAttribute('data-ex-scope-id')) changeScopeSelection(input.dataset.exScopeId,input.checked);
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.exScope) switchScope(button.dataset.exScope);
    if (button.dataset.exGroup) updateTargets([...state.draft.targetIds,...selectableElements().filter(item => item.group === button.dataset.exGroup).map(item => item.id)]);
    if (button.dataset.exAction === 'select-all') updateTargets(selectableElements().map(item => item.id));
    if (button.dataset.exAction === 'clear-scope') { state.draft.scope.ids = []; state.scopes[state.draft.scope.mode] = []; render(); }
    if (button.dataset.exAction === 'clear-all') updateTargets([]);
    if (button.dataset.exAction === 'modeling') requestClose(() => K.navigateTab('modeling'));
  }

  /** 页面只调用一次初始化；事件委托保证往返步骤时不会累积处理器。 */
  function init() {
    if (state.initialized) return;
    state.initialized = true;
    ['closeExtraction','cancelExtraction','extractionPrev','extractionNext','createExtractionTask'].forEach(id => { $(id).type = 'button'; });
    $('closeExtraction').addEventListener('click',() => requestClose());
    $('cancelExtraction').addEventListener('click',() => requestClose());
    $('extractionPrev').addEventListener('click',() => { state.step = Math.max(1,state.step - 1); render(); });
    $('extractionNext').addEventListener('click',next);
    $('createExtractionTask').addEventListener('click',createTask);
    $('extractionWizard').addEventListener('cancel',event => { event.preventDefault(); requestClose(); });
    $('extractionForm').addEventListener('submit',event => { event.preventDefault(); if (state.step === 4) createTask(); else next(); });
    $('extractionStepBody').addEventListener('input',handleInput);
    $('extractionStepBody').addEventListener('change',handleChange);
    $('extractionStepBody').addEventListener('click',handleClick);
  }

  K.extractWizard = Object.freeze({init,open,hasUnsavedChanges});
})();
