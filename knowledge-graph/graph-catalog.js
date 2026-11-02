/* 按发布本体汇总三个业务入口；统计来自当前页数据，不复制或伪造业务记录。 */
(() => {
  const K = KG, $ = K.$, esc = K.escape;
  const modules = {
    extraction:{title:'本体知识抽取',detail:'知识抽取详情',placeholder:'搜索本体名称或描述',note:'待抽取仅展示已发布启用、具有可抽取类型且尚未创建任务的本体。任务全部完成且无待审核结果时显示已完成；其他已创建任务的图谱显示进行中。'},
    fusion:{title:'图谱融合列表',detail:'知识融合详情',placeholder:'搜索图谱名称或描述',note:'待融合仅展示知识抽取已完成、尚无融合记录且有可处理内容的图谱。已有融合建议和处理记录的图谱继续保留，全部处理完后显示已完成。'},
    quality:{title:'图谱质检列表',detail:'图谱质检详情',placeholder:'搜索图谱名称或描述',note:'仅展示质检中和已完成的图谱；点击卡片查看质检进度或最新报告。首次质检请点击“新增质检”。'}
  };
  const stateLabels = {
    extraction:{pending:'待抽取',running:'进行中',completed:'已完成'},
    fusion:{pending:'待融合',running:'进行中',completed:'已完成'},
    quality:{pending:'待质检',running:'质检中',completed:'已完成'}
  };
  const filters = Object.fromEntries(Object.keys(modules).map(key => [key,{query:'',status:'all',page:1}]));
  filters.quality.publishStatus = 'all';
  const pageSize = 6;
  // 质检开始、完成或取消均会改变卡片状态；仅记录本页真实操作，不在浏览时更新时间。
  const qualityUpdates = new Map();
  let initialized = false;
  const active = item => item.status !== 'merged' && !item.mergedInto;
  const graphs = () => K.items.filter(item => item.live).map(item => ({
    id:item.id,name:item.live.config.name,description:item.live.config.description,
    enabled:item.live.enabled,version:item.live.version,
    updated:item.history.find(record => record.status === 'approved' && record.version === item.live.version)?.updated || item.updated || item.created
  }));
  const find = id => graphs().find(item => item.id === id);

  /** 日期统一转换后比较；缺失或无效时间放在末尾，相同时间保留原有顺序。 */
  function timeValue(value) {
    const result = Date.parse(String(value || '').trim().replace(' ','T'));
    return Number.isFinite(result) ? result : 0;
  }
  const newestTime = values => Math.max(0,...values.map(timeValue));

  /** 各环节读取自己的活动记录；尚未开始时采用上游完成时间，不受未发布草稿影响。 */
  function extractionUpdatedAt(item) {
    const tasks = K.extract.tasks.filter(task => task.ontologyId === item.id);
    const records = K.results.forOntology(item.id);
    return newestTime([...tasks.flatMap(task => [task.updated,task.created]),
      ...records.entities.map(record => record.reviewedAt),...records.relations.map(record => record.reviewedAt)]) || timeValue(item.updated);
  }
  function fusionUpdatedAt(item) {
    const tasks = K.fusionTasks?.tasks.filter(task => task.ontologyId === item.id) || [];
    const records = K.fusionUI.records.filter(record => record.ontologyId === item.id);
    const candidates = K.fusionUI.candidates.filter(candidate => candidate.ontologyId === item.id);
    return newestTime([...tasks.flatMap(task => [task.updated,task.created]),
      ...records.map(record => record.time),...candidates.map(candidate => candidate.updated)]) || extractionUpdatedAt(item);
  }
  function updatedAt(tab,item) {
    if (tab === 'extraction') return extractionUpdatedAt(item);
    if (tab === 'fusion') return fusionUpdatedAt(item);
    const publication = K.applications?.get(item.id);
    const publicationTime = publication?.history.length || publication?.live ? publication.updated : null;
    return newestTime([K.qualityUI.overview(item.id).detectedAt,qualityUpdates.get(item.id),publicationTime]) || fusionUpdatedAt(item);
  }

  /** 覆盖口径与现有看板一致：已成功处理文档跨任务、跨目标去重，重试不增加任务数。 */
  function extractionStats(id) {
    const tasks = K.extract.tasks.filter(task => task.ontologyId === id);
    const records = K.results.forOntology(id), documents = new Set();
    tasks.forEach(task => task.targets.forEach(target => {
      task.docIds.slice(0,task.progress[target.id]?.processed || 0).forEach(documentId => documents.add(documentId));
    }));
    return {tasks:tasks.length,instances:records.entities.filter(active).length,relations:records.relations.filter(active).length,documents:documents.size,
      pending:[...records.entities,...records.relations].filter(item => active(item) && item.status === 'pending').length};
  }
  function metrics(tab,item) {
    if (tab === 'extraction') {
      const stats = extractionStats(item.id);
      return [['实例数量',stats.instances],['关系数量',stats.relations],['待审核数',stats.pending,false,'gc-attention']];
    }
    if (tab === 'fusion') {
      const stats = K.fusionUI.overview(item.id);
      return [['检测问题数',stats.issueCount],['已处理',stats.processed],['待处理',stats.pending,false,'gc-attention']];
    }
    const report = K.qualityUI.overview(item.id);
    return [['综合评分',report.score === null ? '—' : report.score + '分',false,report.score === null ? '' : 'gc-score'],
      ['检测版本',report.latestVersion == null ? '—' : 'V' + report.latestVersion],
      ['检测问题',report.issueCount ?? '—',false,report.issueCount == null ? '' : 'gc-issues']];
  }
  /** 待抽取必须能走完目标选择和范围选择，不展示禁用或没有可选类型的空本体。 */
  function canExtract(id) {
    return K.extract.ontologies().some(item => item.id === id) &&
      K.extract.selectableElements(id).some(target => target.kind === 'entity' && target.name.trim()) &&
      K.extract.documents.length > 0;
  }
  function extractionState(item) {
    const tasks = K.extract.tasks.filter(task => task.ontologyId === item.id);
    if (!tasks.length) return canExtract(item.id) ? 'pending' : 'blocked';
    return tasks.every(task => task.status === 'completed') && !extractionStats(item.id).pending ? 'completed' : 'running';
  }
  function fusionState(item) {
    const stats = K.fusionUI.overview(item.id);
    const records = K.fusionUI.records.filter(record => record.ontologyId === item.id);
    const pending = K.fusionUI.candidates.some(candidate => candidate.ontologyId === item.id && candidate.status === 'pending');
    if (stats.taskCount || records.length) return pending ? 'running' : 'completed';
    if (extractionState(item) === 'completed') return K.fusionUI.canStart(item.id) ? 'pending' : 'blocked';
    // 旧工作区可能已针对部分抽取结果生成融合建议，保留该入口但不把建议虚计为任务或处理记录。
    return stats.pending ? 'running' : 'blocked';
  }
  /** 供卡片、详情和首次质检共用；接受已发布图谱或其 id，未满足前置条件返回 blocked，不伪造待办。 */
  function workflowState(tab,value) {
    const item = typeof value === 'string' ? find(value) : value;
    if (!item || !Object.hasOwn(modules,tab)) return 'blocked';
    if (tab === 'extraction') return extractionState(item);
    if (tab === 'fusion') return fusionState(item);
    const report = K.qualityUI.overview(item.id);
    if (report.loading) return 'running';
    if (report.recordCount) return 'completed';
    const records = K.results.forOntology(item.id);
    const hasConfirmedData = [...records.entities,...records.relations].some(record => active(record) && record.status === 'approved');
    return item.enabled && hasConfirmedData && fusionState(item) === 'completed' ? 'pending' : 'blocked';
  }
  function stateTag(tab,item) {
    const state = workflowState(tab,item);
    if (state === 'blocked') return '';
    return `<span class="gc-state ${state === 'pending' ? 'muted' : state === 'running' ? 'running' : ''}" data-workflow-state="${state}">${stateLabels[tab][state]}</span>`;
  }
  const publishState = id => K.applications?.status(K.applications.get(id)) || 'draft';

  /** 质检完成与图谱发布分开呈现；最新草稿不掩盖仍保留的旧发布版本。 */
  function publicationSummary(id) {
    const record = K.applications?.get(id), status = K.applications?.status(record) || 'draft';
    const previous = record?.live && record.stage !== 'published' ? `<small>已发布 v${record.live.version} · ${record.live.enabled ? '已启用' : '已禁用'}</small>` : '';
    return `<div class="gc-publish-summary"><div><span>发布状态：</span><span class="status ${status}" data-catalog-publish-state="${status}">${esc(K.labels[status])}</span></div>${previous}</div>`;
  }
  function cardFooter(tab,item) {
    if (!item.enabled) return '本体已禁用 · 暂不可操作';
    const state = workflowState(tab,item);
    if (tab === 'quality') {
      const report = K.qualityUI.overview(item.id);
      if (report.loading) return '正在执行质检，完成后生成新报告';
      if (report.stale) return '数据已更新，可重新质检';
      return report.detectedAt || '知识融合已完成，可开始质检';
    }
    if (state === 'pending') return tab === 'extraction' ? '本体已发布，可创建抽取任务' : '知识抽取已完成，可创建融合任务';
    return '已发布 v' + item.version;
  }
  function card(tab,item) {
    const footer = cardFooter(tab,item);
    return `<article class="ontology-card gc-card gc-${tab}-card" tabindex="0" role="button" data-graph-card="${esc(item.id)}" data-graph-module="${tab}" aria-label="查看${esc(item.name)}的${modules[tab].detail}"><div class="card-main"><div class="card-heading"><span class="ontology-symbol"><svg class="icon" aria-hidden="true"><use href="#graph-icon"/></svg></span><h3 class="card-title" title="${esc(item.name)}">${esc(item.name)}</h3>${stateTag(tab,item)}</div><p class="card-desc">${esc(item.description || '暂无描述')}</p>${tab === 'quality' ? publicationSummary(item.id) : ''}<dl class="gc-metrics">${metrics(tab,item).map(([label,value,attention,emphasis = '']) => `<div><dt>${label}</dt><dd class="${attention && Number(value) > 0 ? 'gc-attention' : ''} ${emphasis}">${esc(value)}</dd></div>`).join('')}</dl></div><footer class="gc-card-footer"><span>${esc(footer)}</span>${cardAction(tab,item)}</footer></article>`;
  }
  function cardAction(tab,item) {
    if (workflowState(tab,item) !== 'pending') return '<span>查看详情 →</span>';
    const label = {extraction:'去抽取',fusion:'去融合',quality:'去质检'}[tab];
    return `<button type="button" class="link-btn" data-catalog-action="start" data-catalog-tab="${tab}" data-catalog-id="${esc(item.id)}" ${item.enabled ? '' : 'disabled title="本体已禁用，请先在本体建模中启用"'}>${label}</button>`;
  }
  function filtered(tab) {
    const filter = filters[tab], query = filter.query.trim().toLowerCase();
    return eligibleGraphs(tab).filter(item => (item.name + ' ' + item.description).toLowerCase().includes(query) &&
      (filter.status === 'all' || workflowState(tab,item) === filter.status) &&
      (tab !== 'quality' || filter.publishStatus === 'all' || publishState(item.id) === filter.publishStatus))
      // 先对完整筛选结果排序，再分页；时间只计算一次，避免比较过程中触发重复读取。
      .map(item => ({...item,sortTime:updatedAt(tab,item)}))
      .sort((first,second) => second.sortTime - first.sortTime);
  }
  // 首次质检仍可从“新增质检”发起，列表只展示已经开始质检的图谱。
  const eligibleGraphs = tab => graphs().filter(item => {
    const state = workflowState(tab,item);
    return tab === 'quality' ? ['running','completed'].includes(state) : state !== 'blocked';
  });
  function emptyCards(tab) {
    const hasEligible = eligibleGraphs(tab).length > 0, hasPublished = graphs().length > 0;
    if (tab === 'quality' && !hasEligible) return '<div class="empty"><h2>暂无质检记录</h2><p>点击“新增质检”，选择已完成知识融合的图谱开始检测。</p><button class="btn" data-catalog-action="create" data-catalog-tab="quality">＋ 新增质检</button></div>';
    const upstream = tab === 'fusion' ? 'extraction' : tab === 'quality' ? 'fusion' : 'modeling';
    const titles = {extraction:'暂无可抽取的本体',fusion:'暂无可融合的图谱',quality:'暂无可质检的图谱'};
    const hints = {extraction:'请先完成实体类型定义、发布并启用本体，再开始知识抽取。',fusion:'完成知识抽取且存在可处理内容后，图谱会进入待融合。已有融合建议或记录的图谱会继续展示。',quality:'点击“新增质检”开始检测，已有质检报告会继续保留。'};
    const labels = {modeling:'前往本体建模',extraction:'前往知识抽取',fusion:'前往知识融合'};
    const target = hasPublished ? upstream : 'modeling';
    return `<div class="empty"><h2>${hasEligible ? '没有符合条件的图谱' : titles[tab]}</h2><p>${hasEligible ? '试试其他名称，或重置筛选条件。' : hints[tab]}</p><button class="btn" data-catalog-action="${hasEligible ? 'reset' : 'upstream'}" data-catalog-tab="${tab}" data-catalog-upstream="${target}">${hasEligible ? '重置筛选' : labels[target]}</button></div>`;
  }
  function renderCards(tab) {
    const items = filtered(tab), filter = filters[tab], pages = Math.max(1,Math.ceil(items.length / pageSize));
    filter.page = Math.max(1,Math.min(filter.page,pages));
    $(tab + 'CatalogCount').textContent = '共 ' + items.length + ' 个本体';
    $(tab + 'GraphCards').innerHTML = items.length ? items.slice((filter.page - 1)*pageSize,filter.page*pageSize).map(item => card(tab,item)).join('') : emptyCards(tab);
    $(tab + 'CatalogPagination').innerHTML = `<span>第 ${filter.page} / ${pages} 页</span><button class="btn small" data-catalog-action="prev" data-catalog-tab="${tab}" ${filter.page === 1 ? 'disabled' : ''}>上一页</button><button class="btn small" data-catalog-action="next" data-catalog-tab="${tab}" ${filter.page >= pages ? 'disabled' : ''}>下一页</button>`;
  }
  function mount(tab) {
    const definition = modules[tab];
    const actions = tab === 'extraction' ? '<button class="btn primary" data-catalog-action="create" data-catalog-tab="extraction">＋ 创建抽取任务</button>' :
      tab === 'fusion' ? '<button class="btn primary" data-catalog-action="create" data-catalog-tab="fusion">＋ 新建融合任务</button>' :
      '<button class="btn primary" data-catalog-action="create" data-catalog-tab="quality">＋ 新增质检</button>';
    const options = Object.entries(stateLabels[tab]).filter(([value]) => tab !== 'quality' || value !== 'pending').map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
    const statusSelect = `<select aria-label="${tab === 'quality' ? '质检状态' : '处理状态'}" data-catalog-status="${tab}"><option value="all">全部状态</option>${options}</select>`;
    const statusFilters = tab === 'quality' ? `<label class="gc-filter-label">质检状态${statusSelect}</label><label class="gc-filter-label">发布状态<select aria-label="发布状态" data-catalog-publish-status="quality"><option value="all">全部状态</option>${Object.entries(K.labels).map(([value,label]) => `<option value="${value}">${esc(label)}</option>`).join('')}</select></label>` : statusSelect;
    $(tab + 'Overview').innerHTML = `<form class="gc-toolbar" data-catalog-form="${tab}"><input type="search" maxlength="50" placeholder="${definition.placeholder}" aria-label="${definition.placeholder}" data-catalog-search="${tab}">${statusFilters}<button class="link-btn" type="button" data-catalog-action="reset" data-catalog-tab="${tab}">重置</button><div class="gc-toolbar-actions">${actions}</div></form><div class="gc-list-head"><h2>${definition.title}<span id="${tab}CatalogCount"></span></h2><p>点击整张卡片进入详情</p></div><div class="cards" id="${tab}GraphCards" data-testid="${tab}-graph-cards"></div><div class="gc-pagination" id="${tab}CatalogPagination"></div><p class="gc-count-note">${definition.note}</p>`;
  }
  function detailHeader(tab,item) {
    const version = item && (tab === 'quality' ? '本体 v' + item.version + ' 已发布' : '已发布 v' + item.version);
    $(tab + 'DetailHeader').innerHTML = `<header class="gc-detail-head"><button class="btn" data-catalog-action="back" data-catalog-tab="${tab}">← 返回列表</button><div><h2 id="${tab}GraphTitle" tabindex="-1">${esc(item?.name || '图谱不可用')} · ${modules[tab].detail}</h2><p>${item ? version + ' · 仅查看当前本体的数据' : '该本体已移除，请返回列表重新选择。'}</p></div>${item && tab !== 'quality' ? stateTag(tab,item) : ''}</header>`;
  }
  /** 本体禁用不影响停用已有图谱发布版本，也不清除其审核历史。 */
  function unavailableMarkup(tab,item) {
    const published = tab === 'quality' && item && K.applications?.get(item.id)?.live;
    const history = published ? `<div class="gc-disabled-publication"><button type="button" class="btn" data-application-action="history" data-application-id="${esc(item.id)}">审核历史</button>${published.enabled ? `<button type="button" class="btn" data-application-action="toggle" data-application-id="${esc(item.id)}">禁用已发布版本</button>` : ''}</div>` : '';
    return '<div class="empty"><h2>该图谱当前不可操作</h2><p>本体已禁用或移除。已有记录不会删除，请先返回本体建模确认启用状态。</p><button class="btn" data-catalog-action="modeling">前往本体建模</button>' + history + '</div>';
  }
  function render() {
    if (!initialized) return;
    Object.keys(modules).forEach(tab => {
      renderCards(tab);
      const detail = K.pageTab === tab && Boolean(K.pageGraphId), item = find(K.pageGraphId);
      $(tab + 'Overview').hidden = detail;
      $(tab + 'DetailView').hidden = !detail;
      if (!detail) return;
      detailHeader(tab,item);
      const unavailable = !item?.enabled;
      $(tab + 'Unavailable').hidden = !unavailable;
      $(tab === 'extraction' ? 'extractionBoardView' : tab + 'Panel').hidden = unavailable;
      $(tab + 'Unavailable').innerHTML = unavailable ? unavailableMarkup(tab,item) : '';
    });
  }
  /** 仅路由进入详情时同步本体，常规数据刷新不会重置详情里的筛选。 */
  function enter(tab,id) {
    if (!modules[tab] || !find(id)?.enabled) return;
    if (tab === 'extraction') K.resultsUI.focusOntology(id);
    if (tab === 'fusion') K.fusionUI.selectOntology(id);
    if (tab === 'quality') K.qualityUI.selectOntology(id);
  }
  function reset(tab) {
    Object.assign(filters[tab],{query:'',status:'all',page:1});
    document.querySelector('[data-catalog-search="' + tab + '"]').value = '';
    document.querySelector('[data-catalog-status="' + tab + '"]').value = 'all';
    if (tab === 'quality') {
      filters[tab].publishStatus = 'all';
      document.querySelector('[data-catalog-publish-status="quality"]').value = 'all';
    }
    renderCards(tab);
  }
  /** 待办按钮直接带入所属图谱；点击时重新核对状态，避免重复创建或误用其它图谱。 */
  function startFor(tab,id) {
    const item = find(id);
    if (!item?.enabled) { K.notify('请先在本体建模中启用该本体，再继续操作。'); return; }
    if (workflowState(tab,item) !== 'pending') { K.notify('图谱状态已变化，请查看最新详情。'); render(); return; }
    if (document.querySelector('dialog[open]')) { K.notify('请先完成或关闭当前弹窗。'); return; }
    if (tab === 'extraction') K.extractWizard.open({ontologyId:id});
    if (tab === 'fusion') K.fusionTasks.open(id);
    if (tab === 'quality') K.qualityUI.openCreate(id);
  }
  function act(event) {
    const target = event.target.closest('[data-catalog-action]');
    if (!target) return;
    event.preventDefault();
    const {catalogAction:action,catalogTab:tab} = target.dataset;
    if (action === 'start') { startFor(tab,target.dataset.catalogId); return; }
    if (action === 'back') { K.navigateTab(tab); return; }
    if (action === 'modeling') { K.navigateTab('modeling'); return; }
    if (action === 'upstream') { K.navigateTab(target.dataset.catalogUpstream); return; }
    if (action === 'reset') { reset(tab); return; }
    if (action === 'prev' || action === 'next') { filters[tab].page += action === 'next' ? 1 : -1; renderCards(tab); return; }
    if (action === 'records') { K.extractionUI.openRecords(null); return; }
    if (action === 'create' && tab === 'extraction') K.extractWizard.open();
    if (action === 'create' && tab === 'fusion') K.fusionTasks.open();
    if (action === 'create' && tab === 'quality') K.qualityUI.openCreate();
  }
  function init() {
    if (initialized) return;
    initialized = true; Object.keys(modules).forEach(mount);
    $('graphPage').addEventListener('click',event => {
      if (event.target.closest('[data-catalog-action]')) { act(event); return; }
      const target = event.target.closest('[data-graph-card]');
      if (target) { K.navigateGraph(target.dataset.graphModule,target.dataset.graphCard); return; }
      act(event);
    });
    $('graphPage').addEventListener('keydown',event => {
      const target = event.target.closest('[data-graph-card]');
      if (target && event.target === target && ['Enter',' '].includes(event.key)) { event.preventDefault(); K.navigateGraph(target.dataset.graphModule,target.dataset.graphCard); }
    });
    $('graphPage').addEventListener('input',event => {
      const tab = event.target.dataset.catalogSearch; if (!tab) return;
      filters[tab].query = event.target.value; filters[tab].page = 1; renderCards(tab);
    });
    $('graphPage').addEventListener('change',event => {
      if (event.target.dataset.catalogPublishStatus === 'quality') {
        filters.quality.publishStatus = event.target.value; filters.quality.page = 1; renderCards('quality'); return;
      }
      const tab = event.target.dataset.catalogStatus; if (!tab) return;
      filters[tab].status = event.target.value; filters[tab].page = 1; renderCards(tab);
    });
    document.querySelectorAll('[data-catalog-form]').forEach(form => form.addEventListener('submit',event => { event.preventDefault(); renderCards(form.dataset.catalogForm); }));
    document.addEventListener('kg:quality-change',event => {
      if (event.detail?.ontologyId) qualityUpdates.set(event.detail.ontologyId,K.now());
      render();
    });
    ['kg:results-change','kg:extraction-change','kg:fusion-change','kg:application-change'].forEach(name => document.addEventListener(name,render));
    render();
  }
  K.graphCatalog = {init,render,enter,graphs,find,extractionStats,workflowState};
})();
