/* 知识融合只处理当前页面的示例数据；人工或任务自动处理均须通过同一组验证。 */
(() => {
  const K = window.KG, $ = K.$, esc = K.escape;
  const categoryNames = {alignment:'实体对齐',coreference:'共指消解',conflict:'冲突消歧'};
  const statusNames = {pending:'待处理',applied:'已通过',approved:'已通过',rejected:'已驳回'};
  const filters = {ontology:'',category:'all',status:'all',keyword:'',confidence:'all'};
  const candidates = [
    {id:'fusion-align-amox',ontologyId:'medical',category:'alignment',entityIds:['e-amox','e-amox-alias'],title:'阿莫西林胶囊 ↔ 阿莫西林（胶囊）',reason:'名称表达相近，来自不同资料记录，建议核对来源确认是否为同一药品。',confidence:96,status:'pending'},
    {id:'fusion-coref-ibuprofen',ontologyId:'medical',category:'coreference',entityIds:['e-ibuprofen-ref','e-ibuprofen'],title:'“该药品” → 布洛芬缓释胶囊',reason:'相邻语句先介绍布洛芬缓释胶囊，后文用“该药品”继续描述适用范围。',confidence:92,status:'pending'},
    {id:'fusion-conflict-amox',ontologyId:'medical',category:'conflict',entityIds:['e-amox'],title:'阿莫西林胶囊 · 生产企业不一致',reason:'不同文档对同一药品的生产企业描述不一致，需要核对来源后选择。',confidence:89,status:'pending',field:'生产企业',values:['华安制药','华康制药']}
  ];
  const records = [];
  let initialized = false, detail = null, problemScope = null;
  const data = () => K.results;
  const rawEntity = id => data()?.entity(id);
  const currentOntology = id => K.extract.ontologies().find(item => item.id === id);
  const candidateById = id => candidates.find(item => item.id === id);
  const processed = candidate => ['applied','approved','rejected'].includes(candidate.status);
  const normalizedName = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const pairKey = ids => [...ids].sort().join('|');
  const selectedOntologyId = () => Object.hasOwn(K,'pageGraphId') ? K.pageGraphId || '' : filters.ontology;

  /** 只读查找尚未生成建议的同名同类型记录，供卡片判断与正式发现共用。 */
  function undiscoveredAlignments(ontologyId) {
    if (!data()) return [];
    const groups = new Map(), available = new Set(K.extract.ontologies().filter(item => !ontologyId || item.id === ontologyId).map(item => item.id));
    data().entities.filter(entity => entity.status === 'approved' && !entity.mergedInto && available.has(entity.ontologyId)).forEach(entity => {
      const name = normalizedName(entity.name); if (!name) return;
      const key = JSON.stringify([entity.ontologyId,entity.typeId,name]);
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(entity);
    });
    const found = [], known = new Set(candidates.filter(item => item.category === 'alignment').map(item => pairKey(item.entityIds)));
    groups.forEach(entities => entities.slice(1).forEach(entity => {
      const primary = entities[0], ids = [primary.id,entity.id], key = pairKey(ids);
      if (known.has(key)) return;
      found.push({primary,entity,ids});
      known.add(key);
    }));
    return found;
  }
  /** 同名同类型仅生成待核对建议，不据此直接认定为同一实体，也不重复生成已处理建议。 */
  function discoverAlignments() {
    undiscoveredAlignments().forEach(({primary,entity,ids}) => {
      candidates.push({id:K.uid('fusion-align'),ontologyId:primary.ontologyId,category:'alignment',entityIds:ids,title:`${primary.name} ↔ ${entity.name}`,reason:'两条已审核记录的实体名称与类型相同，建议结合各自的文档来源确认是否重复。',confidence:94,status:'pending',discovered:true});
    });
  }
  /** 目录只查询能否新建任务，不分配候选、不改结果，也不消耗候选编号。 */
  function canStart(ontologyId) {
    if (!data() || !currentOntology(ontologyId)) return false;
    return candidates.some(item => item.ontologyId === ontologyId && item.status === 'pending' && !item.taskId && candidateAvailable(item)) || undiscoveredAlignments(ontologyId).length > 0;
  }

  function canonical(id) {
    const seen = new Set();
    let entity = rawEntity(id);
    while (entity?.mergedInto && !seen.has(entity.id)) {
      seen.add(entity.id); entity = rawEntity(entity.mergedInto);
    }
    return entity;
  }
  function involved(candidate) {
    return candidate.entityIds.map(id => candidate.category === 'conflict' ? canonical(id) : rawEntity(id)).filter(Boolean);
  }
  function candidateAvailable(candidate) {
    const entities = involved(candidate);
    const sameIdentity = !candidate.discovered || (entities.length === 2 && entities[0].typeId === entities[1].typeId && normalizedName(entities[0].name) === normalizedName(entities[1].name));
    return sameIdentity && Boolean(currentOntology(candidate.ontologyId)) && entities.length === candidate.entityIds.length && entities.every(entity => entity.status === 'approved' && !entity.mergedInto);
  }
  function allProperties(entity) {
    return {...entity.properties,'名称':entity.name};
  }
  function nameOfType(entity) {
    return currentOntology(entity.ontologyId)?.config.entities.find(type => type.id === entity.typeId)?.name || '原类型已调整';
  }
  function inputSignature() {
    const {note,...choice} = detail?.choice || {};
    return JSON.stringify(choice);
  }
  function stateSignature(candidate) {
    const ontology = currentOntology(candidate.ontologyId);
    return JSON.stringify({version:data()?.version,ontology:ontology?.version,entities:involved(candidate),relations:data()?.relations.filter(item => item.ontologyId === candidate.ontologyId)});
  }
  function conflictFields(entities) {
    if (entities.length !== 2) return [];
    const [left,right] = entities.map(allProperties);
    return Object.keys(left).filter(key => key !== '名称' && left[key] && right[key] && left[key] !== right[key]);
  }
  function initialChoice(candidate) {
    const entities = involved(candidate);
    return {primary:entities[0]?.id || '',target:candidate.category === 'coreference' ? entities[1]?.id || '' : '',value:'',properties:{},note:''};
  }

  function panelMarkup() {
    return `<div class="fu-filter-bar"><span class="help">仅处理已审核通过的抽取结果</span></div>
      <section id="fusionTasksView" class="fu-view-panel" aria-label="融合任务列表" data-testid="fusion-tasks-view"></section>`;
  }
  function problemMarkup() {
    return `<div class="fu-intro"><strong>AI 自动识别重复与歧义，保留清晰可信的知识</strong><span>按问题类型核对来源，人工确认处理结果</span></div><nav id="fusionCategories" class="fu-tabs" aria-label="融合类型"></nav><form class="fu-query-bar" id="fusionFilterForm"><label>处理状态<select id="fusionStatus" aria-label="融合处理状态"><option value="all">全部状态</option><option value="pending">待处理</option><option value="processed">已处理</option></select></label><label>建议置信度<select id="fusionConfidence" aria-label="融合建议置信度"><option value="all">全部置信度</option><option value="high">高（≥90%）</option><option value="medium">中（60%–&lt;90%）</option><option value="low">低（&lt;60%）</option></select></label><label class="fu-search-field">关键词<input id="fusionKeyword" type="search" maxlength="50" placeholder="实体名称或候选内容" aria-label="搜索融合建议"></label><button class="btn" type="submit">筛选</button><button class="link-btn" type="button" data-fu-reset>重置</button></form><div class="fu-list-toolbar"><h2>融合建议</h2><span id="fusionCount" class="help" aria-live="polite"></span></div><div class="fu-table-wrap"><table class="fu-table"><thead><tr><th>融合内容 / 类别</th><th>建议依据</th><th>建议置信度</th><th>任务来源</th><th>处理状态 / 结论</th><th>操作</th></tr></thead><tbody id="fusionRows"></tbody></table><div class="fu-empty" id="fusionEmpty" hidden></div></div><p class="help fu-footnote">高置信度通过验证后自动处理；低置信度或验证未通过的结果需人工审核。已通过与已驳回归入已处理，来源与处理记录均保留。</p>`;
  }
  /** 任务计数与清单共用相同范围；缺失的原建议只保留快照，不混入其他任务。 */
  function taskProblems(taskId) {
    const task = K.fusionTasks?.tasks.find(item => item.id === taskId);
    if (!task) return [];
    const unique = new Map(task.results.map(result => [result.id,result]));
    return [...unique.values()].map(result => {
      const item = candidateById(result.id);
      if (item?.taskId === task.id && item.ontologyId === task.ontologyId) return item;
      return {id:result.id,taskId:task.id,ontologyId:task.ontologyId,title:result.title,
        confidence:result.confidence,entityIds:[],category:'unavailable',status:'unavailable',
        unavailable:true,reason:'原始建议暂不可用，保留任务创建时的问题记录。'};
    });
  }
  /** 返回指定本体中尚无有效任务关联的建议，避免历史问题因入口调整而失去访问路径。 */
  function unassignedProblems(ontologyId) {
    return candidates.filter(item => item.ontologyId === ontologyId && !sourceTask(item));
  }
  function scopedProblems() {
    if (!problemScope || problemScope.ontologyId !== filters.ontology) return [];
    if (problemScope.kind === 'task') return taskProblems(problemScope.taskId);
    return problemScope.kind === 'unassigned' ? unassignedProblems(filters.ontology) :
      candidates.filter(item => item.ontologyId === filters.ontology);
  }
  /** 打开新任务时重置筛选；审核子弹窗关闭后仍停留在原清单和筛选位置。 */
  function openProblems(taskId = '',options = {}) {
    if (!initialized) init();
    const ontologyId = selectedOntologyId(), ontology = currentOntology(ontologyId);
    const task = K.fusionTasks?.tasks.find(item => item.id === taskId && item.ontologyId === ontologyId);
    if (!ontology || (taskId && !task)) {
      K.notify('该任务不可用，请返回列表重新选择。'); return false;
    }
    problemScope = {ontologyId,taskId,preferPending:options.status === 'pending',
      kind:task ? 'task' : options.all ? 'ontology' : 'unassigned'};
    Object.assign(filters,{ontology:ontologyId,category:options.category || 'all',
      status:options.status || 'all',keyword:'',confidence:'all'});
    $('fusionProblemsTitle').textContent = '问题清单';
    $('fusionProblemsMeta').textContent = task ? task.name :
      ontology.name + (options.all ? ' · 全部问题' : ' · 未关联任务的问题');
    render();
    const dialog = $('fusionProblemsDialog');
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.dialog-body').scrollTop = 0;
    $('fusionKeyword').focus(); return true;
  }
  /** 子弹窗关闭后按问题 ID 恢复审核或来源按钮；清单未打开时返回 false，由调用方恢复任务入口。 */
  function restoreProblemFocus(candidateId,source = false) {
    if (!$('fusionProblemsDialog').open) return false;
    const attribute = source ? 'data-fu-task-source' : 'data-fu-detail';
    const button = [...$('fusionRows').querySelectorAll('[' + attribute + ']')]
      .find(item => item.getAttribute(attribute) === candidateId);
    (button || $('fusionStatus')).focus(); return true;
  }
  function mountProblemDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'fusionProblemsDialog'; dialog.className = 'fu-problems-dialog';
    dialog.setAttribute('aria-labelledby','fusionProblemsTitle');
    dialog.innerHTML = `<div class="dialog-layout"><header class="dialog-header"><div><h2 id="fusionProblemsTitle">问题清单</h2><p id="fusionProblemsMeta" class="help"></p></div><button class="close" data-fu-problems-close aria-label="关闭问题清单">×</button></header><div class="dialog-body">${problemMarkup()}</div><footer class="dialog-footer"><button class="btn" data-fu-problems-close>关闭</button></footer></div>`;
    document.body.append(dialog);
    dialog.addEventListener('click',panelAction);
    dialog.addEventListener('close',() => {
      if (!dialog.open) K.fusionTasks?.restoreTaskFocus(problemScope?.taskId,problemScope?.preferPending);
    });
  }
  function dialogMarkup() {
    return `<div class="dialog-layout"><header class="dialog-header"><div><h2 id="fusionDetailTitle">融合审核</h2><p id="fusionDetailMeta" class="help"></p></div><button class="close" data-fu-close aria-label="关闭融合审核">×</button></header><div class="dialog-body"><div id="fusionDetailContent"></div><div id="fusionValidation" aria-live="polite"></div><div id="fusionReviewNote"><label class="fu-field-label" for="fusionRemark">审核备注 <small>驳回时必填</small></label><textarea id="fusionRemark" rows="2" maxlength="200" placeholder="记录判断依据，便于后续追溯"></textarea></div><p class="form-error" id="fusionActionError" hidden role="alert"></p></div><footer class="dialog-footer"><span class="footer-note" id="fusionFooterNote">确认时自动检查所选方案</span><button class="btn" data-fu-close>关闭</button><button class="btn" id="fusionReject">驳回建议</button><button class="btn primary" id="fusionApply">人工确认生效</button></footer></div>`;
  }
  /** 只使用候选保存的任务关联，且任务必须属于同一本体；不按名称或时间推断来源。 */
  function sourceTask(candidate) {
    return candidate?.taskId ? K.fusionTasks?.tasks.find(task => task.id === candidate.taskId && task.ontologyId === candidate.ontologyId) : null;
  }
  function taskSourceMarkup(candidate) {
    const task = sourceTask(candidate);
    if (!task) return `<span class="fu-task-unavailable">${candidate.taskId ? '来源任务不可用' : '未关联任务'}</span>`;
    if (candidate.unavailable) return `<span class="fu-task-unavailable">${esc(task.name)}</span>`;
    return `<button type="button" class="link-btn fu-task-source" data-fu-task-source="${esc(candidate.id)}" title="${esc(task.name)}">${esc(task.name)}</button>`;
  }
  function openSourceTask(id) {
    const candidate = candidateById(id), task = sourceTask(candidate);
    if (!task || candidate.ontologyId !== selectedOntologyId() || !currentOntology(candidate.ontologyId)) {
      K.notify('来源任务不可用，请刷新列表后重新查看。'); render(); return;
    }
    K.fusionTasks.openDetail(task.id,candidate.id);
  }
  function rowMarkup(candidate) {
    if (candidate.unavailable) return `<tr data-fusion-candidate="${esc(candidate.id)}"><td><strong>${esc(candidate.title)}</strong></td><td>${esc(candidate.reason)}</td><td>${esc(candidate.confidence)}%</td><td>${taskSourceMarkup(candidate)}</td><td><span class="fu-task-unavailable">记录待核对</span></td><td><span class="fu-task-unavailable">暂不可审核</span></td></tr>`;
    const done = processed(candidate), available = candidate.status === 'pending' && candidateAvailable(candidate);
    const automatic = records.find(record => record.candidateId === candidate.id)?.automatic;
    const conclusion = done ? `<small class="fu-conclusion ${candidate.status === 'rejected' ? 'rejected' : 'approved'}">${automatic ? 'AI 自动处理 · ' : '人工审核 · '}${statusNames[candidate.status]}</small>` : !available ? '<small class="fu-conclusion stale">建议已变化，待重新核对</small>' : candidate.taskId ? '<small class="fu-conclusion">待人工审核</small>' : '';
    const band = candidate.confidence >= 90 ? 'high' : candidate.confidence >= 60 ? 'medium' : 'low';
    return `<tr data-fusion-candidate="${candidate.id}"><td><strong>${esc(candidate.title)}</strong><span class="fu-category-label">${categoryNames[candidate.category]}</span>${candidate.updated ? `<small class="fu-updated">${esc(candidate.updated)}</small>` : ''}</td><td>${esc(candidate.reason)}</td><td><span class="fu-confidence ${band}">${candidate.confidence}%</span></td><td>${taskSourceMarkup(candidate)}</td><td><span class="fu-status ${done ? 'processed' : 'pending'}">${done ? '已处理' : '待处理'}</span>${conclusion}</td><td><button class="link-btn" data-fu-detail="${candidate.id}">${available ? '审核处理' : '详情'}</button></td></tr>`;
  }
  /** 页签数和列表复用同一组条件；类别仅在最终展示时附加，避免汇总与明细不一致。 */
  function filteredCandidates() {
    if (!currentOntology(filters.ontology)) return [];
    const keyword = filters.keyword.trim().toLowerCase();
    return scopedProblems().filter(candidate => {
      if (candidate.ontologyId !== filters.ontology) return false;
      if (candidate.unavailable && filters.status !== 'all') return false;
      if (filters.status !== 'all' && (filters.status === 'processed') !== processed(candidate)) return false;
      const band = candidate.confidence >= 90 ? 'high' : candidate.confidence >= 60 ? 'medium' : 'low';
      if (filters.confidence !== 'all' && filters.confidence !== band) return false;
      const text = [candidate.title,candidate.reason,categoryNames[candidate.category],...involved(candidate).map(entity => entity.name)].join(' ').toLowerCase();
      return !keyword || text.includes(keyword);
    });
  }
  function renderCategories() {
    const filtered = filteredCandidates();
    $('fusionCategories').innerHTML = [['all','全部'],...Object.entries(categoryNames)].map(([key,label]) => {
      const count = filtered.filter(item => key === 'all' || item.category === key).length;
      return `<button data-fu-category="${key}" class="${filters.category === key ? 'active' : ''}" aria-pressed="${filters.category === key}">${label}<span>${count}</span></button>`;
    }).join('');
  }
  /** 供主页面在本体、抽取结果更新后刷新；不会覆盖正在审核的选择。 */
  function render() {
    if (!initialized || !$('fusionPanel')) return;
    discoverAlignments();
    filters.ontology = selectedOntologyId();
    const ontology = currentOntology(filters.ontology), available = Boolean(ontology);
    if ($('createFusionTask')) $('createFusionTask').disabled = !available;
    K.fusionTasks?.render();
    renderCategories();
    const rows = available ? filteredCandidates().filter(item => filters.category === 'all' || item.category === filters.category) : [];
    $('fusionRows').innerHTML = rows.map(rowMarkup).join(''); $('fusionCount').textContent = `共 ${rows.length} 条`;
    $('fusionEmpty').hidden = rows.length > 0;
    const hasFilters = filters.category !== 'all' || filters.status !== 'all' || filters.confidence !== 'all' || filters.keyword.trim();
    $('fusionEmpty').innerHTML = `<strong>${available ? hasFilters ? '没有符合筛选条件的融合建议' : '暂无融合建议' : '当前本体不可用于融合'}</strong><p>${available ? hasFilters ? '试试其他关键词、处理状态或置信度范围。' : '已审核的抽取结果中，存在重复、指代或属性冲突时，会在对应分类中展示。' : '请返回列表，确认本体已发布并启用后再进入。'}</p>${available && hasFilters ? '<button type="button" class="btn small" data-fu-reset>重置筛选</button>' : ''}`;
    $('fusionStatus').value = filters.status; $('fusionConfidence').value = filters.confidence;
    $('fusionKeyword').value = filters.keyword;
    if (detail && $('fusionDetailDialog').open && detail.validation && detail.validation.state !== stateSignature(candidateById(detail.id))) invalidate('关联数据已变化，确认时将重新检查当前方案。');
  }

  function sourceMarkup(entity) {
    return `<section class="fu-source"><strong>${esc(entity.name)}</strong>${(entity.sources || []).map(source => `<article><div>${esc(source.title)}<span>第 ${esc(source.page || 1)} 页</span></div><blockquote>${esc(source.quote || '该文档记录了此实体及其属性。')}</blockquote></article>`).join('') || '<p class="help">暂无文档依据，无法通过验证。</p>'}</section>`;
  }
  function entityCard(entity,label) {
    return `<div class="fu-entity"><small>${label} · ${esc(nameOfType(entity))}</small><strong>${esc(entity.name)}</strong><dl>${Object.entries(entity.properties || {}).map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(value || '未提供')}</dd>`).join('')}</dl></div>`;
  }
  function alignmentChoices(candidate,entities) {
    return `<h3 class="fu-heading">选择保留的标准实体</h3><div class="fu-choice-row">${entities.map(entity => `<label><input type="radio" name="fusionPrimary" data-fu-choice="primary" value="${entity.id}" ${detail.choice.primary === entity.id ? 'checked' : ''}>${esc(entity.name)}${candidate.discovered ? `<small>来自 ${esc(entity.sources?.[0]?.title || '来源待补充')} · 第 ${esc(entity.sources?.[0]?.page || 1)} 页</small>` : ''}</label>`).join('')}</div><p class="help">另一条实体作为别名保留；关联关系将指向标准实体，原始来源不会丢失。</p>${conflictFields(entities).map(key => `<label class="fu-field-label">${esc(key)} <small>存在不同取值，请选择保留值</small></label><div class="fu-choice-row">${entities.map(entity => `<label><input type="radio" name="fusionProperty-${esc(key)}" data-fu-property="${esc(key)}" value="${esc(entity.properties[key])}" ${detail.choice.properties[key] === entity.properties[key] ? 'checked' : ''}>${esc(entity.properties[key])} <small>来自 ${esc(entity.name)}</small></label>`).join('')}</div>`).join('')}`;
  }
  function coreferenceChoices(candidate,entities) {
    const options = data().forOntology(candidate.ontologyId).entities.filter(entity => entity.status === 'approved' && !entity.mergedInto && entity.id !== entities[0].id);
    return `<h3 class="fu-heading">确认指代对象</h3><label class="fu-field-label" for="fusionTarget">“${esc(entities[0].name)}”实际指向</label><select id="fusionTarget" data-fu-choice="target"><option value="">请选择明确的实体</option>${options.map(entity => `<option value="${entity.id}" ${detail.choice.target === entity.id ? 'selected' : ''}>${esc(entity.name)} · ${esc(nameOfType(entity))}</option>`).join('')}</select><p class="help">确认后，相关关系将指向该实体，同时保留原文中的指代表达。</p>`;
  }
  function conflictChoices(candidate) {
    return `<h3 class="fu-heading">选择可信的属性值</h3><p class="help">请结合下方文档原文判断。未选中的值只保留为历史依据，不再作为当前属性。</p><div class="fu-conflict-options">${candidate.values.map(value => `<label><input type="radio" name="fusionConflictValue" data-fu-choice="value" value="${esc(value)}" ${detail.choice.value === value ? 'checked' : ''}><span><strong>${esc(value)}</strong><small>${esc(candidate.field)}</small></span></label>`).join('')}</div>`;
  }
  function choiceMarkup(candidate,entities) {
    if (candidate.category === 'alignment') return alignmentChoices(candidate,entities);
    return candidate.category === 'coreference' ? coreferenceChoices(candidate,entities) : conflictChoices(candidate);
  }
  function recordMarkup(candidate) {
    const record = records.find(item => item.candidateId === candidate.id);
    if (!record) return '';
    return `<section class="fu-record"><h3>处理记录</h3><dl><dt>处理结论</dt><dd>${statusNames[candidate.status]}</dd><dt>处理方式</dt><dd>${record.automatic ? 'AI 自动处理' : '人工审核 · 管理员'}</dd><dt>处理时间</dt><dd>${esc(record.time)}</dd><dt>当次处理结果</dt><dd>${esc(record.summary)}</dd><dt>审核备注</dt><dd>${esc(record.note || '无')}</dd></dl></section>`;
  }
  function renderDetail() {
    const candidate = candidateById(detail.id), entities = involved(candidate), editable = candidate.status === 'pending' && candidateAvailable(candidate);
    $('fusionDetailTitle').textContent = categoryNames[candidate.category] + ' · 审核处理';
    $('fusionDetailMeta').textContent = `${currentOntology(candidate.ontologyId)?.name || '原本体'} · 建议置信度 ${candidate.confidence}%`;
    $('fusionDetailContent').innerHTML = `<p class="fu-reason">${esc(candidate.reason)}</p>${candidate.status !== 'pending' ? recordMarkup(candidate) : ''}${!editable && candidate.status === 'pending' ? '<p class="form-error">相关实体或本体已变化，该建议暂不可执行。请重新核对抽取结果。</p>' : ''}<h3 class="fu-heading">${candidate.status === 'pending' ? '当前实体与属性' : '当前结果'}</h3><div class="fu-comparison">${entities.map((entity,index) => entityCard(entity,candidate.category === 'conflict' ? '待核对实体' : index ? '候选实体' : '原实体')).join('')}</div>${editable ? `<div id="fusionChoices">${choiceMarkup(candidate,entities)}</div><div id="fusionPreview"></div>` : ''}<h3 class="fu-heading">文档来源与原文依据</h3><div class="fu-sources">${entities.map(sourceMarkup).join('')}</div>`;
    $('fusionReviewNote').hidden = !editable; $('fusionRemark').value = detail.choice.note;
    ['fusionReject','fusionApply'].forEach(id => $(id).hidden = !editable);
    $('fusionApply').disabled = !editable; $('fusionValidation').innerHTML = ''; $('fusionActionError').hidden = true;
    $('fusionFooterNote').textContent = editable ? '确认时自动检查所选方案' : '处理结果和来源已保留';
    if (editable) renderPreview();
  }
  function openDetail(id) {
    const candidate = candidateById(id);
    if (!candidate || candidate.ontologyId !== selectedOntologyId() || !currentOntology(candidate.ontologyId)) {
      K.notify('请先进入对应图谱的融合详情，再查看这条建议。'); return false;
    }
    detail = {id,choice:initialChoice(candidate),validation:null}; renderDetail();
    if (!$('fusionDetailDialog').open) $('fusionDetailDialog').showModal();
    return true;
  }

  function proposed(candidate) {
    const entities = involved(candidate), choice = detail.choice;
    if (candidate.category === 'conflict') return {keep:entities[0],remove:null,properties:{...entities[0]?.properties,[candidate.field]:choice.value},name:entities[0]?.name};
    const keep = candidate.category === 'alignment' ? entities.find(entity => entity.id === choice.primary) : rawEntity(choice.target);
    const remove = candidate.category === 'alignment' ? entities.find(entity => entity.id !== choice.primary) : entities[0];
    return {keep,remove,name:keep?.name,properties:{...remove?.properties,...keep?.properties,...choice.properties,'名称':keep?.name}};
  }
  function affectedRelations(plan) {
    return plan.remove ? data().relations.filter(relation => relation.fromId === plan.remove.id || relation.toId === plan.remove.id) : [];
  }
  function renderPreview() {
    const candidate = candidateById(detail.id), plan = proposed(candidate);
    if (!$('fusionPreview')) return;
    $('fusionPreview').innerHTML = `<h3 class="fu-heading">处理后预览 <span>尚未生效</span></h3><div class="fu-preview"><strong>${esc(plan.name || '请选择保留实体')}</strong><dl>${Object.entries(plan.properties || {}).map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(value || '待选择')}</dd>`).join('')}</dl><p>${plan.remove ? `合并 ${esc(plan.remove.name)} 的文档依据，更新 ${affectedRelations(plan).length} 条关联关系。` : '仅更新选定属性，保留不同来源的原始记载。'}</p></div>`;
  }

  /** 子类型可满足父类型约束；用发布版本验证，不读取正在编辑的草稿。 */
  function isType(entityType,requiredType,ontology) {
    const seen = new Set(); let type = ontology.config.entities.find(item => item.id === entityType);
    while (type && !seen.has(type.id)) {
      if (type.id === requiredType) return true;
      seen.add(type.id); type = ontology.config.entities.find(item => item.id === type.parentId);
    }
    return false;
  }
  function checkRelations(plan,ontology) {
    return affectedRelations(plan).every(relation => {
      if (relation.status === 'rejected' || relation.status === 'merged') return true;
      const type = ontology.config.relations.find(item => item.id === relation.typeId);
      const from = relation.fromId === plan.remove.id ? plan.keep : canonical(relation.fromId);
      const to = relation.toId === plan.remove.id ? plan.keep : canonical(relation.toId);
      return Boolean(type && from && to && from.id !== to.id && isType(from.typeId,type.from,ontology) && isType(to.typeId,type.to,ontology));
    });
  }
  function checkRequired(plan,ontology) {
    const seen = new Set(); let type = ontology.config.entities.find(item => item.id === plan.keep?.typeId);
    while (type && !seen.has(type.id)) {
      if (type.properties.some(property => property.required && !String(plan.properties[property.name] ?? '').trim())) return false;
      seen.add(type.id); type = ontology.config.entities.find(item => item.id === type.parentId);
    }
    return Boolean(seen.size);
  }
  function checksFor(candidate) {
    const plan = proposed(candidate), entities = involved(candidate), ontology = currentOntology(candidate.ontologyId);
    const selected = candidate.category === 'conflict' ? candidate.values.includes(detail.choice.value) : Boolean(plan.keep && plan.remove && plan.keep.id !== plan.remove.id);
    const propertiesSelected = candidate.category !== 'alignment' || conflictFields(entities).every(field => entities.some(entity => entity.properties[field] === detail.choice.properties[field]));
    const compatible = candidate.category === 'conflict' || Boolean(ontology && plan.keep && plan.remove && (isType(plan.keep.typeId,plan.remove.typeId,ontology) || isType(plan.remove.typeId,plan.keep.typeId,ontology)));
    const available = candidate.status === 'pending' && candidateAvailable(candidate) && (candidate.category !== 'coreference' || (plan.keep?.status === 'approved' && !plan.keep.mergedInto && plan.keep.ontologyId === candidate.ontologyId));
    return [
      {label:'建议仍有效，相关结果均已审核通过',pass:available},
      {label:'已选择处理方案，所有不同属性值已明确',pass:selected && propertiesSelected},
      {label:'实体类型兼容，符合当前本体约束',pass:compatible},
      {label:'必填属性完整，名称不为空',pass:Boolean(selected && ontology && plan.keep && checkRequired(plan,ontology))},
      {label:'属性格式符合本体定义',pass:Boolean(ontology && plan.keep && K.hierarchy.effective(ontology.config,plan.keep.typeId).every(field => K.qualityUI.validProperty(plan.properties[field.name],field.type || '文本')))},
      {label:'关联关系方向与起止类型符合定义',pass:Boolean(selected && ontology && (!plan.remove || checkRelations(plan,ontology)))},
      {label:'原始文档依据完整保留，结果可追溯',pass:entities.every(entity => entity.sources?.length) && Boolean(plan.keep?.sources?.length)}
    ];
  }
  function validate() {
    const candidate = candidateById(detail.id), checks = checksFor(candidate), passed = checks.every(check => check.pass);
    detail.validation = {passed,checks,state:stateSignature(candidate),choices:inputSignature()};
    $('fusionValidation').innerHTML = `<section class="fu-validation ${passed ? 'passed' : 'failed'}"><strong>${passed ? '检查通过，等待确认生效' : '暂不能确认，请完善处理方案'}</strong><ul>${checks.map(check => `<li class="${check.pass ? 'pass' : 'fail'}"><span>${check.pass ? '✓' : '!'}</span>${check.label}</li>`).join('')}</ul></section>`;
    $('fusionFooterNote').textContent = passed ? '检查通过，确认后才会生效' : '请完善提示内容后重新确认';
    $('fusionActionError').hidden = true;
    $('fusionValidation').scrollIntoView({block:'nearest'});
    return passed;
  }
  function invalidate(message = '处理方案已修改，确认时将自动检查。') {
    if (!detail) return;
    detail.validation = null; $('fusionApply').disabled = !candidateAvailable(candidateById(detail.id));
    $('fusionValidation').innerHTML = `<p class="fu-validation-notice">${esc(message)}</p>`;
    $('fusionFooterNote').textContent = '确认时自动检查所选方案';
  }
  function setError(message) {
    $('fusionActionError').textContent = message; $('fusionActionError').hidden = false;
  }

  function mergeSources(primary,secondary) {
    const unique = new Map();
    [...(primary.sources || []),...(secondary?.sources || [])].forEach(source => unique.set(JSON.stringify([source.documentId,source.page,source.quote]),K.clone(source)));
    return Array.from(unique.values());
  }
  function applyPlan(candidate,plan,options = {}) {
    const before = K.clone(involved(candidate));
    plan.keep.properties = K.clone(plan.properties);
    if (plan.remove) {
      plan.keep.sources = mergeSources(plan.keep,plan.remove);
      plan.keep.aliases = Array.from(new Set([...(plan.keep.aliases || []),...(plan.remove.aliases || []),plan.remove.name]));
      affectedRelations(plan).forEach(relation => {
        if (relation.fromId === plan.remove.id) relation.fromId = plan.keep.id;
        if (relation.toId === plan.remove.id) relation.toId = plan.keep.id;
      });
      plan.remove.mergedInto = plan.keep.id; plan.remove.status = 'merged';
    }
    const summary = plan.remove ? `已将“${plan.remove.name}”归入“${plan.keep.name}”，来源与别名已保留。` : `${candidate.field}已确认采用“${detail.choice.value}”，原文依据已保留。`;
    const record = {id:K.uid('fusion-record'),candidateId:candidate.id,category:candidate.category,ontologyId:candidate.ontologyId,status:'applied',time:K.now(),note:detail.choice.note.trim(),summary,before,after:K.clone(plan.keep),validation:K.clone(detail.validation.checks),automatic:Boolean(options.automatic),taskId:candidate.taskId};
    records.unshift(record); candidate.status = 'applied'; candidate.updated = record.time;
    plan.keep.fusionHistory = [...(plan.keep.fusionHistory || []),record.id];
    data().touch('fusion-confirmed');
    if (!options.automatic) { renderDetail(); render(); K.notify('融合结果已人工确认并生效，处理记录已保留。'); }
  }
  function confirmApply() {
    if (!detail || !validate()) return;
    const candidate = candidateById(detail.id);
    const detailId = detail.id;
    K.confirm({title:'确认融合结果生效？',text:'确认后会按预览更新实体、属性或关联关系。原始来源与处理记录仍会保留。',label:'确认生效',action:() => {
      if (!detail || detail.id !== detailId || candidate.status !== 'pending') return;
      if (!detail.validation?.passed || detail.validation.state !== stateSignature(candidate) || detail.validation.choices !== inputSignature() || !checksFor(candidate).every(check => check.pass)) { invalidate('关联信息已变化，请核对后重新确认。'); return; }
      applyPlan(candidate,proposed(candidate));
    }});
  }
  function reject() {
    const candidate = candidateById(detail.id);
    if (candidate.status !== 'pending' || !candidateAvailable(candidate)) { setError('该建议已处理或不再有效。'); return; }
    if (!detail.choice.note.trim()) { setError('请填写驳回理由，便于后续核对。'); $('fusionRemark').focus(); return; }
    const detailId = detail.id;
    K.confirm({title:'驳回这条融合建议？',text:'驳回后不会修改实体与关系；建议及驳回理由会保留在处理记录中。',label:'确认驳回',danger:true,action:() => {
      if (!detail || detail.id !== detailId || candidate.status !== 'pending' || !candidateAvailable(candidate)) return;
      const record = {id:K.uid('fusion-record'),candidateId:candidate.id,category:candidate.category,ontologyId:candidate.ontologyId,status:'rejected',time:K.now(),note:detail.choice.note.trim(),summary:'已驳回建议，原实体、属性和关系保持不变。'};
      records.unshift(record); candidate.status = 'rejected'; candidate.updated = record.time;
      renderDetail(); render(); document.dispatchEvent(new CustomEvent('kg:fusion-change')); K.notify('已驳回建议，原有知识未修改。');
    }});
  }
  function changed(event) {
    if (!detail) return;
    const target = event.target;
    if (target.id === 'fusionRemark') { detail.choice.note = target.value; return; }
    if (target.dataset.fuChoice) detail.choice[target.dataset.fuChoice] = target.value;
    else if (target.dataset.fuProperty) detail.choice.properties[target.dataset.fuProperty] = target.value;
    else return;
    invalidate(); renderPreview();
  }
  function panelAction(event) {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-fu-problems-close')) { $('fusionProblemsDialog').close(); return; }
    if (button.hasAttribute('data-fu-open-problems')) { openProblems(); return; }
    if (button.dataset.fuTaskSource) { openSourceTask(button.dataset.fuTaskSource); return; }
    if (button.dataset.fuDetail) { openDetail(button.dataset.fuDetail); return; }
    if (button.hasAttribute('data-fu-reset')) { resetFilters(); return; }
    if (button.dataset.fuCategory) { filters.category = button.dataset.fuCategory; render(); }
  }
  function resetFilters() {
    Object.assign(filters,{category:'all',status:'all',keyword:'',confidence:'all'}); render();
  }
  function filterChanged() {
    filters.status = $('fusionStatus').value; filters.confidence = $('fusionConfidence').value; filters.keyword = $('fusionKeyword').value;
    render();
  }
  /** 质检先导航至融合页，再按本体与问题实体定位；无精确匹配时仅展示列表，不打开无关建议。 */
  function focus({ontologyId,entityIds = [],category = 'alignment'} = {}) {
    if (!initialized) init();
    if (!currentOntology(ontologyId)) { K.notify('该本体当前不可用于融合，请先确认已发布并启用。'); return false; }
    if (!categoryNames[category]) { K.notify('没有找到对应的融合类型。'); return false; }
    if (Object.hasOwn(K,'pageGraphId') && (K.pageTab !== 'fusion' || K.pageGraphId !== ontologyId)) {
      K.notify('请先进入对应图谱的融合详情，再定位这条建议。'); return false;
    }
    const activeDialog = [...document.querySelectorAll('dialog[open]')]
      .find(dialog => dialog.id !== 'fusionProblemsDialog');
    if (activeDialog) { K.notify('请先关闭当前详情，再查看对应的融合建议。'); return false; }
    discoverAlignments();
    const ids = new Set(entityIds);
    const candidate = candidates.find(item => item.ontologyId === ontologyId && item.category === category && item.status === 'pending' && candidateAvailable(item) && (ids.size === 1 ? item.entityIds.some(id => ids.has(id)) : item.entityIds.every(id => ids.has(id))));
    const task = sourceTask(candidate);
    openProblems(task?.id || '',{all:!candidate,category,status:'pending'});
    if (!entityIds.length) return true;
    if (!candidate) { K.notify('当前没有与该问题匹配的待处理建议，请在列表中核对处理记录。'); return false; }
    openDetail(candidate.id); return true;
  }
  /** 初始化一次；容器由主页面提供，抽屉自行管理关闭以兼容主页面导航保护。 */
  function init() {
    if (initialized || !$('fusionPanel')) return;
    initialized = true; $('fusionPanel').innerHTML = panelMarkup();
    mountProblemDialog();
    const dialog = document.createElement('dialog'); dialog.id = 'fusionDetailDialog'; dialog.className = 'fu-drawer'; dialog.setAttribute('aria-labelledby','fusionDetailTitle'); dialog.innerHTML = dialogMarkup(); document.body.append(dialog);
    $('fusionPanel').addEventListener('click',panelAction);
    ['fusionStatus','fusionConfidence'].forEach(id => $(id).addEventListener('change',filterChanged));
    $('fusionKeyword').addEventListener('input',filterChanged);
    $('fusionFilterForm').addEventListener('submit',event => { event.preventDefault(); filterChanged(); });
    dialog.addEventListener('click',event => { if (event.target.closest('[data-fu-close]')) dialog.close(); });
    // close 事件可能晚于下一次定位打开，避免清空刚打开的审核内容。
    dialog.addEventListener('close',() => {
      if (dialog.open) return;
      const candidateId = detail?.id; detail = null;
      if (!K.fusionTasks?.refreshDetail(candidateId)) restoreProblemFocus(candidateId);
    });
    dialog.addEventListener('change',changed); $('fusionRemark').addEventListener('input',changed);
    $('fusionApply').addEventListener('click',confirmApply); $('fusionReject').addEventListener('click',reject);
    document.addEventListener('kg:results-change',render); document.addEventListener('kg:extraction-change',render); render();
  }
  /** 参考术语只提供标准名称与别名的对应依据；不推断冲突属性值。 */
  function prepareTask(ontologyId,libraries) {
    discoverAlignments();
    candidates.filter(item => item.ontologyId === ontologyId && item.status === 'pending' && !item.taskId).forEach(item => { delete item.termReference; delete item.termAmbiguous; });
    const entities = data().forOntology(ontologyId).entities.filter(entity => entity.status === 'approved' && !entity.mergedInto);
    const terms = libraries.flatMap(library => library.terms.filter(term => term.enabled).map(term => ({...term,libraryName:library.name})));
    terms.forEach(term => {
      const names = new Set([term.name,...term.aliases].map(normalizedName));
      const matching = entities.filter(entity => names.has(normalizedName(entity.name)));
      if (matching.length < 2) return;
      const primary = matching.find(entity => normalizedName(entity.name) === normalizedName(term.name)) || matching[0];
      matching.filter(entity => entity !== primary).forEach(entity => {
        const ids = [primary.id,entity.id];
        let candidate = candidates.find(item => item.ontologyId === ontologyId && item.category === 'alignment' && pairKey(item.entityIds) === pairKey(ids));
        if (!candidate) {
          candidate = {id:K.uid('fusion-terms'),ontologyId,category:'alignment',entityIds:ids,title:primary.name + ' ↔ ' + entity.name,reason:'术语库将上述表达归为同一标准术语，请结合文档依据确认。',confidence:95,status:'pending'};
          candidates.push(candidate);
        }
        if (!candidate.taskId && candidate.status === 'pending') candidate.termReference = {name:term.name,library:term.libraryName,definition:term.definition};
      });
    });
    const pending = candidates.filter(candidate => candidate.ontologyId === ontologyId && candidate.status === 'pending' && !candidate.taskId && candidateAvailable(candidate));
    pending.forEach(candidate => {
      candidate.termAmbiguous = involved(candidate).some(entity => {
        const matching = terms.filter(term => [term.name,...term.aliases].some(name => normalizedName(name) === normalizedName(entity.name)));
        return new Set(matching.map(term => normalizedName(term.name))).size > 1;
      });
    });
    return pending;
  }
  /** 自动路径复用人工验证；任何未明确的属性选择都转人工，不猜测保留值。 */
  function automatic(id) {
    const candidate = candidateById(id);
    if (!candidate || !candidateAvailable(candidate) || candidate.status !== 'pending') return {passed:false,reason:'关联结果已变化，需要人工核对'};
    if (candidate.termAmbiguous) return {passed:false,reason:'参考术语存在多种标准表达，需要人工核对'};
    if (candidate.category === 'conflict') return {passed:false,reason:'不同来源的属性值存在冲突，需要人工核对原文后选择保留值'};
    const previous = detail;
    try {
      detail = {id,choice:initialChoice(candidate),validation:null};
      if (candidate.termReference) {
        const standard = involved(candidate).find(entity => normalizedName(entity.name) === normalizedName(candidate.termReference.name));
        if (standard) detail.choice.primary = standard.id;
      }
      detail.choice.note = candidate.termReference ? '参考 ' + candidate.termReference.library + '：' + candidate.termReference.name : '依据当前文档与本体约束自动处理';
      const checks = checksFor(candidate);
      const failures = ['关联结果已变化','处理对象或冲突属性值尚未明确','实体类型不兼容','必填属性不完整','属性格式不符合定义','关联关系不满足本体约束','缺少可追溯的文档来源'];
      if (!checks.every(check => check.pass)) return {passed:false,reason:'转人工核对：'+checks.flatMap((check,index) => check.pass ? [] : [failures[index]]).join('；')};
      detail.validation = {passed:true,checks};
      applyPlan(candidate,proposed(candidate),{automatic:true});
      return {passed:true,reason:'验证通过，已自动处理'};
    } finally { detail = previous; }
  }
  /** 卡片目录统计只计仍有效的待处理建议，已处理结论和任务快照继续保留。 */
  function overview(id) {
    discoverAlignments();
    const items = candidates.filter(item => item.ontologyId === id);
    return {taskCount:0,libraryCount:0,...K.fusionTasks?.overview(id),
      issueCount:items.length,
      pending:items.filter(item => item.status === 'pending' && candidateAvailable(item)).length,
      processed:items.filter(processed).length};
  }
  /** 仅由路由进入本体详情时调用；数据刷新保留当前筛选条件。 */
  function selectOntology(id) {
    if (!initialized) init();
    problemScope = null;
    if ($('fusionProblemsDialog').open) $('fusionProblemsDialog').close();
    filters.ontology = id || ''; filters.category = 'all'; resetFilters();
    K.fusionTasks?.render();
  }
  K.fusionUI = {init,render,openDetail,openProblems,taskProblems,unassignedProblems,restoreProblemFocus,focus,records,candidates,prepareTask,automatic,canStart,selectOntology,selectedOntologyId,overview};
})();
