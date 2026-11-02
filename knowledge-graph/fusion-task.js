/* 融合任务保存创建时的本体、术语与阈值；只在本页执行，不连接真实 AI 服务。 */
(() => {
  const K = KG, $ = K.$, esc = K.escape, tasks = [], seededTasks = new Map();
  let initialized = false, running = false, lockedOntologyId = '', detailTaskId = '', detailSourceId = '';
  const ontologies = () => K.extract.ontologies();
  const candidate = id => K.fusionUI.candidates.find(item => item.id === id);
  const pending = task => K.fusionUI.taskProblems(task.id).filter(item => item.status === 'pending').length;
  const autoCount = task => new Set(task.results.filter(result => result.automatic).map(result => result.id)).size;
  function render() {
    if (!initialized) return;
    const id = K.fusionUI.selectedOntologyId(), shown = tasks.filter(task => task.ontologyId === id);
    $('fusionTaskCount').textContent = '共 ' + shown.length + ' 个任务';
    const unassigned = K.fusionUI.unassignedProblems(id).length;
    $('fusionUnassignedProblems').hidden = !unassigned;
    $('fusionUnassignedProblems').textContent = '未关联任务的问题（' + unassigned + '）';
    $('fusionTaskList').hidden = !shown.length; $('fusionTaskEmpty').hidden = Boolean(shown.length);
    $('fusionTaskList').innerHTML = `<table class="fu-task-table"><thead><tr><th>任务名称</th><th>检测问题数</th><th>自动处理</th><th>待人工审核</th></tr></thead><tbody>${shown.map(taskRow).join('')}</tbody></table>`;
    if (!shown.length) renderEmpty(id);
  }
  function taskRow(task) {
    const problems = K.fusionUI.taskProblems(task.id), remaining = pending(task);
    const progress = remaining ? `<button type="button" class="link-btn fu-task-pending" data-fusion-task-pending="${esc(task.id)}" aria-label="${esc(task.name)}：待人工处理 ${remaining} 条，查看待处理问题">待人工处理 ${remaining} 条</button>` :
      problems.some(item => item.unavailable) ? '存在待核对记录' : '已处理完成';
    return `<tr class="fu-task-row" data-fusion-task="${esc(task.id)}"><td><strong>${esc(task.name)}</strong><small>${esc(task.created)} · 自动处理 ≥${task.threshold}% · ${task.libraries.length ? '参考 '+task.libraries.length+' 个同名术语库' : '未设置参考同名术语库'}</small></td><td><button type="button" class="link-btn fu-problem-count" data-fusion-task-problems="${esc(task.id)}" aria-label="${esc(task.name)}的检测问题数：${problems.length}，查看问题清单">${problems.length}</button></td><td>${autoCount(task)} 条</td><td>${progress}</td></tr>`;
  }
  /** 没有任务时解释当前进度，仍可直接查看尚未归入任务的问题。 */
  function renderEmpty(id) {
    const available = ontologies().some(item => item.id === id), ready = available && K.fusionUI.canStart(id);
    $('fusionTaskEmpty').innerHTML = `<strong>${available ? '暂无融合任务' : '当前本体不可用于融合'}</strong><p>${ready ? '新建融合任务后，可在这里查看检测问题数，并继续审核待处理问题。' : available ? '新建任务后，可点击检测问题数查看问题清单和处理记录。' : '请返回列表，确认本体已发布并启用后再进入。'}</p>${ready ? '<button type="button" class="btn" data-fusion-create>新建融合任务</button>' : ''}`;
  }
  function ranges() {
    const value = Number($('fusionThreshold').value);
    $('fusionRouteSummary').textContent = Number.isInteger(value) && value >= 1 && value <= 100 ?
      `高置信度：${value}%–100%（含 ${value}%），AI 自动处理；低置信度：0%–<${value}%，人工审核。` : '请输入 1–100 的整数分界值。';
  }
  function defaultName() {
    const item = ontologies().find(item => item.id === $('fusionTaskOntology').value);
    $('fusionTaskName').value = (item?.name || '本体') + '-知识融合-' + K.now().slice(0,10);
  }
  /** 总览可选择本体；从某张卡片或详情打开时固定该本体，避免任务与页面错位。 */
  function open(ontologyId) {
    if (!initialized) init();
    if (running) return false;
    const items = ontologies();
    lockedOntologyId = typeof ontologyId === 'string' ? ontologyId : (K.pageTab === 'fusion' ? K.pageGraphId || '' : '');
    if (lockedOntologyId && !items.some(item => item.id === lockedOntologyId)) {
      K.notify('该本体已禁用或不可用，请返回列表确认本体状态。'); return false;
    }
    if (!items.length) { K.notify('请先发布并启用本体，再新建融合任务。'); return false; }
    const shown = lockedOntologyId ? items.filter(item => item.id === lockedOntologyId) : items;
    $('fusionTaskOntology').innerHTML = (lockedOntologyId ? '' : '<option value="">请选择本体</option>') + shown.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · v${item.version}</option>`).join('');
    $('fusionTaskOntology').value = lockedOntologyId || items[0]?.id || '';
    $('fusionTaskOntology').disabled = Boolean(lockedOntologyId);
    $('fusionTaskScopeNote').hidden = !lockedOntologyId;
    defaultName(); $('fusionThreshold').value = 90; ranges(); $('fusionTaskError').hidden = true;
    $('fusionTaskLibraries').innerHTML = K.terms.available().map(item => `<label><input type="checkbox" value="${esc(item.id)}" data-fusion-library><span>${esc(item.name)}</span><small>${item.terms.filter(term => term.enabled).length} 条已启用术语</small></label>`).join('') || '<p class="help">暂无可用同名术语库。可以先在左侧同名术语库中创建并启用术语，也可以不选同名术语库继续。</p>';
    $('fusionTaskDialog').showModal(); $('fusionTaskName').focus();
    return true;
  }
  function error(message) { $('fusionTaskError').textContent = message; $('fusionTaskError').hidden = false; }
  function readConfiguration() {
    const ontology = ontologies().find(item => item.id === $('fusionTaskOntology').value);
    const name = $('fusionTaskName').value.trim(), threshold = Number($('fusionThreshold').value);
    const ids = [...$('fusionTaskLibraries').querySelectorAll('input:checked')].map(input => input.value);
    const libraries = K.terms.available().filter(item => ids.includes(item.id));
    if (!name || name.length > 50) return {error:'请填写 1–50 个字的任务名称。'};
    if (!ontology) return {error:'请选择已发布且启用的本体。'};
    if (lockedOntologyId && ontology.id !== lockedOntologyId) return {error:'本任务仅用于当前图谱，请关闭后重新创建。'};
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) return {error:'置信度分界须为 1–100 的整数。'};
    if (libraries.length !== ids.length) return {error:'所选同名术语库已禁用、删除或没有已启用术语，请重新选择。'};
    return {ontology,name,threshold,libraries};
  }
  function setRunning(value) {
    running = value; $('fusionTaskFields').disabled = value; $('fusionTaskSubmit').disabled = value;
    $('fusionTaskSubmit').textContent = value ? '正在执行…' : '创建并执行';
    $('fusionTaskDialog').querySelectorAll('[data-fusion-task-close]').forEach(button => { button.disabled = value; });
  }
  /** 高置信度仍必须满足本体与来源约束；验证失败转人工，不错误地标记完成。 */
  function execute(config,targets,options = {}) {
    const task = {id:K.uid('fusion-task'),name:config.name,ontologyId:config.ontology.id,ontologyName:config.ontology.name,
      ontologyVersion:config.ontology.version,threshold:config.threshold,created:K.now(),
      libraries:K.clone(config.libraries.map(library => ({...library,terms:library.terms.filter(term => term.enabled)}))),results:[]};
    tasks.unshift(task);
    targets.forEach(item => {
      item.taskId = task.id;
      const high = item.confidence >= task.threshold;
      let outcome = {passed:false,reason:'低于自动处理分界，等待人工审核'};
      try { if (high) outcome = K.fusionUI.automatic(item.id); }
      catch (failure) { outcome = {passed:false,reason:'自动检查未能完成，已保留原始记录，请人工核对'}; }
      task.results.push({id:item.id,title:item.title,confidence:item.confidence,automatic:outcome.passed,
        reason:outcome.reason,reference:K.clone(item.termReference || null)});
    });
    render(); document.dispatchEvent(new CustomEvent('kg:fusion-change'));
    if (!options.silent) K.notify(`任务已完成分流：自动处理 ${autoCount(task)} 条，待人工审核 ${pending(task)} 条。`);
    return task;
  }
  function seededSummary(task) {
    const completed = task.results.length > 0 && task.results.every(result => result.automatic && candidate(result.id)?.status === 'applied');
    return {ok:true,completed,taskId:task.id,automatic:autoCount(task),pending:pending(task),
      ...(completed ? {} : {error:'部分建议未通过自动检查，已保留为待人工处理。'})};
  }
  /** 状态样例也走实际验证与合并；不弹提示、不跳页，重复初始化不会重复执行。 */
  function seedCompleted(ontologyId) {
    if (!initialized || running) return {ok:false,completed:false,error:'请在融合页面初始化完成且没有任务执行时准备样例。'};
    const previous = tasks.find(task => task.id === seededTasks.get(ontologyId));
    if (previous) return seededSummary(previous);
    const ontology = ontologies().find(item => item.id === ontologyId);
    if (!ontology || !K.fusionUI.canStart(ontologyId)) return {ok:false,completed:false,error:'该本体没有可新建任务的有效融合建议。'};
    const targets = K.fusionUI.prepareTask(ontologyId,[]);
    if (!targets.length) return {ok:false,completed:false,error:'有效融合建议已变化，无法创建样例任务。'};
    const task = execute({ontology,name:ontology.name + '-知识融合-' + K.now().slice(0,10),threshold:90,libraries:[]},targets,{silent:true});
    seededTasks.set(ontologyId,task.id);
    return seededSummary(task);
  }
  /** 分组样例复用正式分流；每组绑定独立候选，重复初始化不重复分配或处理。 */
  function seedExample(ontologyId,options = {}) {
    if (!initialized || running) return {ok:false,error:'请等待融合页面准备完成。'};
    const seedKey = options.seedKey ? ontologyId + ':' + options.seedKey : ontologyId;
    const previous = tasks.find(task => task.id === seededTasks.get(seedKey));
    if (previous) return {ok:true,taskId:previous.id};
    const ontology = ontologies().find(item => item.id === ontologyId);
    if (!ontology) return {ok:false,error:'本体尚未发布或已禁用。'};
    const selected = options.candidateIds ? new Set(options.candidateIds) : null;
    const targets = K.fusionUI.prepareTask(ontologyId,[]).filter(item => !selected || selected.has(item.id));
    if (!targets.length) return {ok:false,error:'没有可分配的融合建议。'};
    if (selected && targets.length !== selected.size) return {ok:false,error:'分组建议已分配或失效，请核对任务归属。'};
    const task = execute({ontology,name:options.name || ontology.name + '-知识融合',
      threshold:options.threshold ?? 95,libraries:[]},targets,{silent:true});
    seededTasks.set(seedKey,task.id);
    return {ok:true,taskId:task.id};
  }
  function submit(event) {
    event.preventDefault(); if (running) return;
    const config = readConfiguration(); if (config.error) { error(config.error); return; }
    const targets = K.fusionUI.prepareTask(config.ontology.id,config.libraries);
    if (!targets.length) { error('该本体暂无未分配的有效融合建议。已有任务中的待处理结果请继续人工审核。'); return; }
    setRunning(true);
    // 本地计算先给出执行状态；回调再次核对本体和术语，避免使用已失效配置。
    setTimeout(() => {
      try {
        const fresh = readConfiguration(); if (fresh.error) { error(fresh.error); return; }
        const current = K.fusionUI.prepareTask(fresh.ontology.id,fresh.libraries);
        if (!current.length) { error('待处理建议已变化，请关闭后重新查看。'); return; }
        const task = execute(fresh,current); $('fusionTaskDialog').close();
        // 先关闭创建弹窗，再进入对应本体详情，遵循主页面的导航保护。
        if (K.navigateGraph) K.navigateGraph('fusion',task.ontologyId);
        else K.fusionUI.selectOntology(task.ontologyId);
        K.graphCatalog?.render();
      } catch (failure) { error('任务未能完成，请核对结果后重试；已完成部分不会重复处理。'); }
      finally { setRunning(false); }
    },240);
  }
  function openDetail(id,sourceId = '') {
    const task = tasks.find(item => item.id === id); if (!task) return;
    if (task.ontologyId !== K.fusionUI.selectedOntologyId() || !ontologies().some(item => item.id === task.ontologyId)) {
      K.notify('请先进入对应图谱的融合详情，再查看任务记录。'); return;
    }
    detailTaskId = id; detailSourceId = sourceId;
    renderDetail(task);
    if (!$('fusionTaskDetail').open) $('fusionTaskDetail').showModal();
  }
  function renderDetail(task) {
    $('fusionTaskDetailTitle').textContent = task.name;
    const refs = task.libraries.map(library => `<details class="fu-task-snapshot"><summary>${esc(library.name)} · ${library.terms.length} 条参考术语</summary><ul>${library.terms.map(term => `<li><strong>${esc(term.name)}</strong>${term.aliases.length ? '（'+esc(term.aliases.join('、'))+'）' : ''}：${esc(term.definition || '暂无释义')}</li>`).join('')}</ul></details>`).join('');
    $('fusionTaskDetailBody').innerHTML = `<dl class="q-detail-facts"><dt>所属本体</dt><dd>${esc(task.ontologyName)} · v${task.ontologyVersion}</dd><dt>创建时间</dt><dd>${esc(task.created)}</dd><dt>高置信度</dt><dd>${task.threshold}%–100%，验证通过后 AI 自动处理</dd><dt>低置信度</dt><dd>0%–<${task.threshold}%，人工审核处理</dd></dl><h3>参考术语快照</h3>${refs || '<p class="help">本次未选择参考同名术语库，按本体与文档依据处理。</p>'}<p class="help">以下保留任务创建时的参考内容，后续编辑、禁用或删除术语不影响此记录。</p><h3>处理结果</h3>${task.results.map(result => {
      const item = candidate(result.id), available = item?.taskId === task.id && item.ontologyId === task.ontologyId;
      const done = available && ['applied','approved','rejected'].includes(item.status);
      return `<article class="fu-task-outcome"><div><strong>${esc(result.title)}</strong><span>${result.confidence}%</span></div><p>${!available ? '原始记录暂不可用，请重新核对' : result.automatic ? 'AI 自动处理 · 已通过' : done ? '人工审核 · '+(item.status === 'rejected' ? '已驳回' : '已通过') : '待人工处理'} · ${esc(result.reason)}</p>${result.reference ? `<p>参考：${esc(result.reference.library)} / ${esc(result.reference.name)}</p>` : ''}${available ? `<button class="link-btn" data-task-candidate="${esc(result.id)}">${done ? '查看处理记录' : '审核处理'}</button>` : ''}</article>`;
    }).join('')}`;
  }
  /** 审核后刷新任务结论，再将焦点还给原问题；父弹窗保持打开和原滚动位置。 */
  function refreshDetail(candidateId) {
    const task = tasks.find(item => item.id === detailTaskId);
    if (!$('fusionTaskDetail')?.open || !task) return false;
    const body = $('fusionTaskDetail').querySelector('.dialog-body'), scrollTop = body.scrollTop;
    renderDetail(task); body.scrollTop = scrollTop;
    const button = [...body.querySelectorAll('[data-task-candidate]')]
      .find(item => item.dataset.taskCandidate === candidateId);
    (button || $('fusionTaskDetail').querySelector('[data-task-detail-close]')).focus({preventScroll:true});
    return true;
  }
  /** 关闭清单回到原数量入口；待处理已清零时回到同一任务的全部问题数。 */
  function restoreTaskFocus(taskId,preferPending = false) {
    const attribute = preferPending ? 'data-fusion-task-pending' : 'data-fusion-task-problems';
    const button = [...$('fusionTaskList').querySelectorAll('[' + attribute + ']')]
      .find(item => item.getAttribute(attribute) === taskId);
    const total = [...$('fusionTaskList').querySelectorAll('[data-fusion-task-problems]')]
      .find(item => item.dataset.fusionTaskProblems === taskId);
    const fallback = $('fusionUnassignedProblems').hidden ? $('createFusionTask') : $('fusionUnassignedProblems');
    (button || total || fallback).focus({preventScroll:true});
  }
  function mountDialogs() {
    const dialog = document.createElement('dialog'); dialog.id = 'fusionTaskDialog'; dialog.className = 'fu-task-dialog'; dialog.setAttribute('aria-labelledby','fusionTaskTitle');
    dialog.innerHTML = `<form class="dialog-layout" id="fusionTaskForm" novalidate><header class="dialog-header"><h2 id="fusionTaskTitle">新建融合任务</h2><button class="close" type="button" data-fusion-task-close aria-label="关闭新建融合任务">×</button></header><div class="dialog-body"><p class="form-error" id="fusionTaskError" role="alert" hidden></p><fieldset id="fusionTaskFields"><label class="fu-task-field">任务名称<input id="fusionTaskName" maxlength="50" required></label><label class="fu-task-field">选择本体<select id="fusionTaskOntology" required></select></label><div class="fu-task-field"><span>参考同名术语库 <small class="help">可多选，选填</small></span><div class="fu-task-libraries" id="fusionTaskLibraries"></div><small class="help">仅使用启用的同名术语库与术语，帮助识别标准名称和别名。</small></div><div class="fu-routing"><label>自动处理分界<input id="fusionThreshold" type="number" min="1" max="100" step="1" required aria-label="自动处理置信度分界">% </label><p id="fusionRouteSummary"></p><p>高置信度仍需通过类型、属性和来源检查；检查不通过或属性存在冲突时转人工审核。</p></div></fieldset></div><footer class="dialog-footer"><button class="btn" type="button" data-fusion-task-close>取消</button><button class="btn primary" type="submit" id="fusionTaskSubmit">创建并执行</button></footer></form>`;
    document.body.append(dialog); $('fusionTaskForm').addEventListener('submit',submit);
    $('fusionTaskOntology').insertAdjacentHTML('afterend','<small class="help" id="fusionTaskScopeNote" hidden>当前任务仅处理此本体。如需处理其他本体，请返回融合列表创建。</small>');
    dialog.addEventListener('click',event => { if (event.target.closest('[data-fusion-task-close]') && !running) dialog.close(); });
    dialog.addEventListener('cancel',event => { if (running) event.preventDefault(); });
    $('fusionThreshold').addEventListener('input',ranges); $('fusionTaskOntology').addEventListener('change',defaultName);
    const detail = document.createElement('dialog'); detail.id = 'fusionTaskDetail'; detail.className = 'fu-task-dialog'; detail.setAttribute('aria-labelledby','fusionTaskDetailTitle');
    detail.innerHTML = '<div class="dialog-layout"><header class="dialog-header"><h2 id="fusionTaskDetailTitle"></h2><button class="close" data-task-detail-close aria-label="关闭任务详情">×</button></header><div class="dialog-body" id="fusionTaskDetailBody"></div><footer class="dialog-footer"><button class="btn" data-task-detail-close>关闭</button></footer></div>';
    document.body.append(detail);
    detail.addEventListener('click',event => {
      if (event.target.closest('[data-task-detail-close]')) detail.close();
      const button = event.target.closest('[data-task-candidate]');
      if (button) K.fusionUI.openDetail(button.dataset.taskCandidate);
    });
    detail.addEventListener('close',() => {
      if (detail.open) return;
      if (!K.fusionUI.restoreProblemFocus(detailSourceId,true)) restoreTaskFocus(detailTaskId);
      detailTaskId = ''; detailSourceId = '';
    });
  }
  function init() {
    if (initialized) return;
    K.fusionUI.init(); initialized = true;
    const toolbar = $('fusionPanel').querySelector('.fu-filter-bar');
    toolbar.insertAdjacentHTML('beforeend','<button class="btn primary fu-create" id="createFusionTask">＋ 新建融合任务</button>');
    $('fusionTasksView').innerHTML = '<section class="fu-task-section" id="fusionTaskSection"><header><h2>融合任务</h2><div class="fu-task-summary"><span id="fusionTaskCount" aria-live="polite"></span><button type="button" class="link-btn" id="fusionUnassignedProblems" data-fu-open-problems hidden></button></div></header><p class="help fu-task-intro">点击“检测问题数”查看全部问题，点击“待人工处理”直接核对待处理问题。</p><div class="fu-task-list" id="fusionTaskList"></div><div class="fu-empty fu-task-empty" id="fusionTaskEmpty" hidden></div><p class="help fu-footnote">任务保留创建时的本体版本、参考术语和分流配置，处理记录可持续追溯。</p></section>';
    $('createFusionTask').addEventListener('click',() => open(K.fusionUI.selectedOntologyId()));
    $('fusionTaskEmpty').addEventListener('click',event => { if (event.target.closest('[data-fusion-create]')) open(K.fusionUI.selectedOntologyId()); });
    $('fusionTaskList').addEventListener('click',event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.fusionTaskProblems) K.fusionUI.openProblems(button.dataset.fusionTaskProblems);
      if (button.dataset.fusionTaskPending) K.fusionUI.openProblems(button.dataset.fusionTaskPending,{status:'pending'});
    });
    document.addEventListener('kg:results-change',render);
    document.addEventListener('kg:fusion-change',render);
    $('fusionDetailDialog').addEventListener('close',render);
    mountDialogs(); render();
  }
  function overview(id) {
    const items = tasks.filter(task => task.ontologyId === id);
    return {taskCount:items.length,libraryCount:new Set(items.flatMap(task => task.libraries.map(library => library.id))).size};
  }
  K.fusionTasks = {init,render,tasks,open,openDetail,refreshDetail,restoreTaskFocus,overview,seedCompleted,seedExample};
})();
