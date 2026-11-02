/* 知识抽取列表与详情只展示本次页面内的任务快照，不操作真实文档。 */
(() => {
  const K = window.KG, X = K.extract, $ = K.$, esc = K.escape;
  const statuses = {running:'运行中',completed:'已完成',partial:'部分失败'};
  const kinds = {entity:'实体',relation:'关系',property:'属性'};
  const filters = {ontology:'all',status:'all',keyword:'',page:1};
  const pageSize = 8;
  let selectedTaskId = null, scopeOntologyId = null, elementsTaskId = null, elementsKind = 'entity';
  const currency = value => '¥' + Number(value || 0).toFixed(2);
  const taskById = id => X.tasks.find(task => task.id === id);
  const targetName = target => target.label || target.name;
  const taskStatus = task => `<span class="ex-status ${task.status}">${statuses[task.status] || '运行中'}</span>`;

  function coverageMarkup(task,limit = task.targets.length) {
    const rows = task.targets.slice(0,limit).map(target => {
      const progress = task.progress[target.id] || {processed:0,total:task.docIds.length,failed:0};
      const percent = progress.total ? Math.min(100,Math.round(progress.processed / progress.total * 100)) : 0;
      return `<div class="ex-coverage-item"><div><span title="${esc(targetName(target))}">${esc(targetName(target))}</span><strong>${percent}%</strong></div><progress value="${progress.processed}" max="${progress.total || 1}" aria-label="${esc(targetName(target))}覆盖率">${percent}%</progress><small>${progress.processed} / ${progress.total} 篇${progress.failed ? ' · ' + progress.failed + ' 篇失败' : ''}</small></div>`;
    }).join('');
    return rows + (task.targets.length > limit ? `<button class="link-btn ex-more-targets" data-task-detail="${task.id}">查看全部 ${task.targets.length} 个元素</button>` : '');
  }
  function propertiesMarkup(target) {
    const properties = target.properties || [];
    if (!properties.length) return '<small class="ex-secondary">未定义属性</small>';
    return `<details class="rb-task-properties"><summary>含全部 ${properties.length} 项属性</summary><ul>${properties.map(property => `<li>${esc(property.name)}${property.inheritedFrom ? `<small>继承自 ${esc(property.inheritedFrom)}</small>` : ''}</li>`).join('')}</ul></details>`;
  }
  function taskRow(task) {
    const groups = taskResults(task), summary = `${groups.entity.length} 个实体、${groups.relation.length} 个关系`;
    return `<tr data-extraction-task="${task.id}"><td><button class="link-btn ex-task-name" data-task-detail="${task.id}">${esc(task.name)}</button><p class="ex-secondary">${esc(task.ontologyName)} · v${task.version}</p><small class="ex-secondary">${esc(task.created)}</small></td><td><div class="ex-scope-text">${esc(task.scope.summary)}</div><p class="ex-secondary">${task.docIds.length} 篇文档</p>${task.recommendationId ? '<span class="ex-incremental">补充抽取</span>' : ''}</td><td>${taskStatus(task)}</td><td><button type="button" class="link-btn ex-elements-summary" data-task-elements="${task.id}" aria-haspopup="dialog" aria-controls="extractionElementsDialog" aria-label="${esc(task.name)}：${summary}，查看本体元素明细">${summary}</button></td></tr>`;
  }
  /** 计数和明细使用同一任务的实际记录，不以类型数量替代实例数量。 */
  function taskResults(task) {
    return Object.fromEntries([['entity','entities'],['relation','relations']].map(([kind,collection]) =>
      [kind,K.results[collection].filter(record => record.ontologyId === task.ontologyId && record.taskId === task.id)]));
  }
  function resultType(task,record,kind) {
    return task.targets.find(target => target.id === kind + ':' + record.typeId)?.name ||
      K.results.typeName(task.ontologyId,kind === 'entity' ? 'entities' : 'relations',record.typeId);
  }
  function resultProperties(record) {
    const entries = Object.entries(record.properties || {});
    return entries.length ? `<dl class="ex-instance-properties">${entries.map(([name,value]) =>
      `<div><dt>${esc(name)}</dt><dd>${esc(value === '' || value == null ? '未填写' : value)}</dd></div>`).join('')}</dl>` : '<span class="ex-secondary">暂无属性值</span>';
  }
  /** 仅呈现任务范围内的证据，融合补入的其它任务来源不串入本任务。 */
  function resultSources(task,record) {
    const sources = (record.sources || []).filter(source => task.docIds.includes(source.documentId));
    return sources.length ? sources.map(source => `<article class="ex-instance-source" data-document-id="${esc(source.documentId)}"><strong>${esc(source.title || X.documents.find(doc => doc.id === source.documentId)?.title || '来源文档')}</strong><small>${source.page ? '第 ' + esc(source.page) + ' 页' : '页码未记录'}</small><blockquote>${esc(source.quote || '暂无可展示的文档片段。')}</blockquote></article>`).join('') :
      '<span class="ex-secondary">暂无本任务范围内的来源片段</span>';
  }
  function resultRow(task,record,kind) {
    const relation = kind === 'relation', type = resultType(task,record,kind);
    const name = relation ? type : record.name || '未命名实例';
    const endpoints = relation ? (K.results.entity(record.fromId)?.name || '实体已移除') + ' → ' + (K.results.entity(record.toId)?.name || '实体已移除') : type;
    const merged = record.status === 'merged' || Boolean(record.mergedInto);
    const labels = {pending:'待审核',approved:'已审核通过',rejected:'已审核未通过',merged:'已合并'};
    const status = merged ? 'merged' : record.status;
    return `<tr class="ex-instance-row" data-result-kind="${kind}" data-result-id="${esc(record.id)}"><td><strong>${esc(name)}</strong><small class="ex-secondary">${esc(endpoints)}</small></td><td><strong>${Number.isFinite(record.confidence) ? record.confidence + '%' : '—'}</strong><span class="ex-result-status ${esc(status)}">${labels[status] || '待核对'}</span></td><td>${resultProperties(record)}</td><td>${resultSources(task,record)}</td></tr>`;
  }
  function renderElements(task) {
    const groups = taskResults(task);
    $('extractionElementsMeta').textContent = `${task.name} · ${task.ontologyName} v${task.version}`;
    $('extractionElementsBody').innerHTML = `<nav class="ex-instance-tabs" aria-label="抽取结果类型">${Object.entries(groups).map(([kind,rows]) =>
      `<button type="button" data-elements-kind="${kind}" aria-pressed="${elementsKind === kind}">${kind === 'entity' ? '实体实例' : '关系实例'}（${rows.length}）</button>`).join('')}</nav>` +
      Object.entries(groups).map(([kind,rows]) => `<section data-result-panel="${kind}" ${elementsKind === kind ? '' : 'hidden'}>${rows.length ?
        `<div class="ex-table-wrap"><table class="ex-instance-table"><thead><tr><th>${kind === 'entity' ? '实例名称 / 所属类型' : '关系类型 / 起始与目标实体'}</th><th>置信度 / 审核状态</th><th>属性值</th><th>来源文档与片段</th></tr></thead><tbody>${rows.map(record => resultRow(task,record,kind)).join('')}</tbody></table></div>` :
        `<div class="ex-empty"><h3>本任务暂无${kinds[kind]}实例</h3><p>${task.status === 'running' ? '任务正在运行，已产生的结果会显示在这里。' : '没有已记录的抽取结果，可点击任务名称查看抽取范围与处理情况。'}</p></div>`}</section>`).join('');
  }
  function openElements(id) {
    const task = taskById(id); if (!task) { K.notify('任务已不存在。'); return; }
    elementsTaskId = id; elementsKind = 'entity'; renderElements(task);
    if (!$('extractionElementsDialog').open) $('extractionElementsDialog').showModal();
  }
  function filterTasks() {
    return X.tasks.filter(task => (!scopeOntologyId || task.ontologyId === scopeOntologyId) && (filters.ontology === 'all' || task.ontologyId === filters.ontology) && (filters.status === 'all' || task.status === filters.status) && (task.name + task.ontologyName + task.targets.map(targetName).join(' ')).toLowerCase().includes(filters.keyword));
  }
  function renderFilters() {
    const names = new Map(X.tasks.map(task => [task.ontologyId,task.ontologyName]));
    X.ontologies().forEach(item => names.set(item.id,item.name));
    if (filters.ontology !== 'all' && !names.has(filters.ontology)) filters.ontology = 'all';
    $('extractionOntologyFilter').innerHTML = '<option value="all">全部本体</option>' + Array.from(names,([id,name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    $('extractionOntologyFilter').value = filters.ontology;
    $('extractionOntologyFilter').closest('label').hidden = Boolean(scopeOntologyId);
  }
  function renderTasks() {
    renderFilters();
    const tasks = filterTasks(), pageCount = Math.max(1,Math.ceil(tasks.length / pageSize));
    filters.page = Math.min(filters.page,pageCount);
    $('extractionTaskRows').innerHTML = tasks.slice((filters.page - 1) * pageSize,filters.page * pageSize).map(taskRow).join('');
    $('extractionTaskEmpty').hidden = tasks.length > 0;
    $('extractionTaskCount').textContent = tasks.length;
    $('extractionPageInfo').textContent = `共 ${tasks.length} 个任务 · 第 ${filters.page} / ${pageCount} 页`;
    $('extractionPagePrev').disabled = filters.page <= 1; $('extractionPageNext').disabled = filters.page >= pageCount;
  }

  function routeDescription(routing) {
    return `高 ≥${routing.high}% → 融合候选；中 ≥${routing.medium}% 且＜${routing.high}% → 人工复核；低＜${routing.medium}% → 暂不采纳`;
  }
  function strategyMarkup(task) {
    return task.targets.map(target => {
      const strategy = task.strategies[target.id] || {};
      return `<tr><td>${esc(targetName(target))}<small class="ex-secondary">${kinds[target.kind]}</small>${propertiesMarkup(target)}</td><td>${strategy.mode === 'rule' ? '规则 · ' + esc(strategy.rule) : '大模型 · ' + esc(strategy.model)}<small class="ex-secondary">${esc(strategy.mode === 'rule' ? strategy.keywords : strategy.instruction || '根据本体定义识别，保留原文依据')}</small></td></tr>`;
    }).join('');
  }
  function renderDetail(task) {
    $('extractionTaskTitle').textContent = task.name;
    const documents = X.documents.filter(item => task.docIds.includes(item.id));
    const failed = Object.values(task.progress).reduce((sum,item) => sum + item.failed,0);
    $('extractionTaskDetail').innerHTML = `<div class="ex-detail-summary">${taskStatus(task)}<span>${esc(task.ontologyName)} · 已发布 v${task.version}</span><small>${esc(task.created)}</small></div><p class="notice">任务使用创建时的本体版本和配置，后续本体修改不会改变本任务。</p>${task.status === 'partial' ? `<p class="form-error">有 ${failed} 次目标文档处理失败。重试仅处理失败部分，已完成结果会保留。</p>` : ''}<h3 class="ex-detail-heading">本体元素覆盖率</h3><p class="help">已完成抽取的文档数 / 该目标范围文档数；失败文档不计入已完成。</p><div class="ex-detail-coverage">${coverageMarkup(task)}</div><h3 class="ex-detail-heading">抽取目标与策略</h3><div class="ex-table-wrap"><table class="ex-detail-table"><thead><tr><th>抽取目标及全部属性</th><th>抽取策略</th></tr></thead><tbody>${strategyMarkup(task)}</tbody></table></div><h3 class="ex-detail-heading">统一置信度分流</h3><p class="notice">${routeDescription(task.routing)}</p><p class="help">本任务的全部实体、关系及属性均采用以上规则。</p><h3 class="ex-detail-heading">文档范围</h3><p class="ex-scope-text">${esc(task.scope.summary)} · ${documents.length} 篇文档</p><div class="ex-detail-documents">${documents.map(doc => `<div><span>${esc(doc.title)}</span><small>${esc(doc.sourceName)} · ${doc.pages} 页</small></div>`).join('')}</div><p class="help">预估扫描 ${task.estimate.pages} 页，约 ${task.estimate.minutes} 分钟，预估费用 ${currency(task.estimate.cost)}。费用为示例估算，不产生实际扣费。</p>`;
    $('retryExtractionTask').hidden = task.status !== 'partial';
    $('viewExtractionOntology').disabled = !K.items.some(item => item.id === task.ontologyId);
  }
  function openDetail(id) {
    const task = taskById(id); if (!task) { K.notify('任务已不存在。'); return; }
    selectedTaskId = id; renderDetail(task);
    if (!$('extractionTaskDialog').open) $('extractionTaskDialog').showModal();
  }
  function openRecords(ontologyId = K.pageTab === 'extraction' ? K.pageGraphId : null) {
    const scopeChanged = scopeOntologyId !== (ontologyId || null);
    scopeOntologyId = ontologyId || null;
    if (scopeChanged) resetFilters(); else renderTasks();
    const name = K.items.find(item => item.id === scopeOntologyId)?.live?.config.name;
    $('extractionRecordsTitle').textContent = name ? name + ' · 抽取任务记录' : '抽取任务记录';
    $('extractionRecordsDialog').querySelector('.footer-note').textContent = name ? '仅显示当前本体的任务，关闭后返回详情' : '关闭后返回图谱卡片列表';
    if (!$('extractionRecordsDialog').open) $('extractionRecordsDialog').showModal();
  }
  function viewOntology() {
    const task = taskById(selectedTaskId); if (!task) return;
    $('extractionTaskDialog').close(); $('extractionRecordsDialog').close();
    K.openOntology(task.ontologyId);
  }
  function retry(id) {
    const task = taskById(id); if (!task || task.status !== 'partial') return;
    K.confirm({title:'重试失败部分？',text:'将按原任务的文档范围、抽取策略和置信度配置重试失败部分，已经完成的结果会保留。',label:'确认重试',action:() => {
      const result = X.retryTask(id);
      if (result.error) { K.notify(result.error); return; }
      render(); if ($('extractionTaskDialog').open) renderDetail(result.task);
      K.notify('已发起重试，已完成的抽取结果已保留。');
    }});
  }
  function listAction(event) {
    const elements = event.target.closest('[data-task-elements]');
    if (elements) { openElements(elements.dataset.taskElements); return; }
    const detail = event.target.closest('[data-task-detail]');
    if (detail) { openDetail(detail.dataset.taskDetail); return; }
    const retryButton = event.target.closest('[data-task-retry]');
    if (retryButton) { retry(retryButton.dataset.taskRetry); return; }
  }
  function resetFilters() {
    Object.assign(filters,{ontology:'all',status:'all',keyword:'',page:1});
    $('extractionSearch').value = ''; $('extractionStatusFilter').value = 'all'; renderTasks();
  }
  function render() { renderTasks(); }
  function init() {
    $('createExtraction').addEventListener('click',() => K.extractWizard.open({ontologyId:K.resultsUI?.ontologyId()}));
    $('openExtractionRecords').addEventListener('click',() => openRecords());
    $('extractionRecordsDialog').addEventListener('click',listAction);
    $('extractionElementsBody').addEventListener('click',event => {
      const button = event.target.closest('[data-elements-kind]'); if (!button) return;
      elementsKind = button.dataset.elementsKind;
      $('extractionElementsBody').querySelectorAll('[data-elements-kind]').forEach(tab => tab.setAttribute('aria-pressed',String(tab.dataset.elementsKind === elementsKind)));
      $('extractionElementsBody').querySelectorAll('[data-result-panel]').forEach(panel => { panel.hidden = panel.dataset.resultPanel !== elementsKind; });
    });
    $('extractionElementsDialog').addEventListener('close',() => {
      if ($('extractionElementsDialog').open || !$('extractionRecordsDialog').open) return;
      const trigger = [...$('extractionTaskRows').querySelectorAll('[data-task-elements]')].find(button => button.dataset.taskElements === elementsTaskId);
      trigger?.focus(); elementsTaskId = null;
    });
    $('extractionOntologyFilter').addEventListener('change',event => { filters.ontology = event.target.value; filters.page = 1; renderTasks(); });
    $('extractionStatusFilter').addEventListener('change',event => { filters.status = event.target.value; filters.page = 1; renderTasks(); });
    const search = () => { filters.keyword = $('extractionSearch').value.trim().toLowerCase(); filters.page = 1; renderTasks(); };
    $('extractionSearch').addEventListener('input',search);
    $('extractionSearchForm').addEventListener('submit',event => { event.preventDefault(); search(); });
    ['resetExtractionFilters','clearExtractionSearch'].forEach(id => $(id).addEventListener('click',resetFilters));
    $('extractionPagePrev').addEventListener('click',() => { filters.page--; renderTasks(); });
    $('extractionPageNext').addEventListener('click',() => { filters.page++; renderTasks(); });
    $('retryExtractionTask').addEventListener('click',() => retry(selectedTaskId));
    $('viewExtractionOntology').addEventListener('click',viewOntology);
    document.addEventListener('kg:extraction-change',event => {
      if (event.detail?.type === 'created') resetFilters();
      render();
    });
    document.addEventListener('kg:results-change',() => {
      renderTasks();
      const task = taskById(elementsTaskId);
      if (task && $('extractionElementsDialog').open) renderElements(task);
    });
  }
  K.extractionUI = {init,render,openDetail,openRecords};
})();
