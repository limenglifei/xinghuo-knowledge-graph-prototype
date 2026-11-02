/* 本体维度抽取看板；任务记录在独立抽屉中查看，审核不会跨本体进行。 */
(() => {
  const K = window.KG, R = K.results, X = K.extract, $ = K.$, esc = K.escape;
  const S = {ontologyId:'medical',kind:'entities',typeId:'',includeChildren:true,statuses:[],query:'',page:1,selected:new Set()};
  const labels = {pending:'待审核',approved:'已审核通过',rejected:'已审核未通过'};
  // 空选表示全部；已审核统计对应两个明确状态，不再添加笼统的审核状态选项。
  const metricStatuses = {all:[],reviewed:['approved','rejected'],pending:['pending']};
  const pageSize = 6;
  let detailId = null, reviewIds = [];
  const options = () => ({ontologyId:S.ontologyId,kind:S.kind,typeId:S.typeId,includeChildren:S.includeChildren});
  const statusTag = item => '<span class="rb-status '+item.status+'">'+(labels[item.status] || '已融合')+'</span>';
  const confidence = item => '<span class="rb-confidence"><i class="'+(item.confidence >= 90 ? 'high' : item.confidence >= 60 ? 'medium' : 'low')+'" style="width:'+item.confidence+'%"></i></span><b class="rb-confidence-value">'+item.confidence+'%</b>';
  const nameOf = item => S.kind === 'entities' ? item.name : (R.entity(item.fromId)?.name || '实体已移除')+' → '+(R.entity(item.toId)?.name || '实体已移除');
  const propertyTags = item => Object.entries(item.properties || {}).map(([key,value]) => '<span class="rb-property">'+esc(key)+'：'+esc(value || '未提供')+'</span>').join('') || '<span class="help">暂无属性</span>';
  const currentOntology = () => X.ontologies().find(item => item.id === S.ontologyId);
  const confidenceBand = item => item.confidence >= 90 ? 'high' : item.confidence >= 60 ? 'medium' : 'low';
  // 仅使用结果记录的任务归属，不用相同文档或其他本体的任务猜测来源。
  const sourceTask = item => X.tasks.find(task => task.id === item.taskId && task.ontologyId === item.ontologyId);

  function normalize() {
    const items = X.ontologies();
    if (!items.some(item => item.id === S.ontologyId)) { S.ontologyId = items[0]?.id || ''; S.typeId = ''; S.selected.clear(); }
    const config = currentOntology()?.config;
    if (S.typeId && !config?.[S.kind].some(item => item.id === S.typeId)) S.typeId = '';
  }
  function filterRows() {
    const query = S.query.trim().toLowerCase();
    return R.rows(options()).filter(item => matchesStatus(item) &&
      (nameOf(item)+' '+R.typeName(S.ontologyId,S.kind,item.typeId)+' '+Object.values(item.properties).join(' ')+' '+item.sources.map(source => source.title).join(' ')).toLowerCase().includes(query));
  }
  /** 已审核包含通过与未通过，口径与上方统计一致；已合并结果由 R.rows 排除。 */
  function matchesStatus(item) {
    return !S.statuses.length || S.statuses.includes(item.status);
  }
  function syncStatusFilter() {
    const names = Object.keys(labels).filter(status => S.statuses.includes(status)).map(status => labels[status]);
    $('rbStatusText').textContent = names.join('、') || '全部状态';
    $('rbStatusSummary').title = $('rbStatusText').textContent;
    $('rbStatusAll').setAttribute('aria-pressed',String(!S.statuses.length));
    $('rbStatus').querySelectorAll('[data-rb-status]').forEach(input => { input.checked = S.statuses.includes(input.dataset.rbStatus); });
  }
  function changeStatusSelection(input) {
    const statuses = new Set(S.statuses);
    input.checked ? statuses.add(input.dataset.rbStatus) : statuses.delete(input.dataset.rbStatus);
    // 选满或清空都回到全部，避免“全部”与具体状态同时显示为选中。
    S.statuses = statuses.size === Object.keys(labels).length ? [] : [...statuses];
    syncStatusFilter(); resetSelection(); renderTable();
  }
  function initStatusFilter() {
    $('rbStatus').addEventListener('change',event => {
      if (event.target.dataset.rbStatus) changeStatusSelection(event.target);
    });
    $('rbStatusAll').addEventListener('click',() => {
      S.statuses = []; $('rbStatus').open = false;
      syncStatusFilter(); resetSelection(); renderTable(); $('rbStatusSummary').focus();
    });
    $('rbStatus').addEventListener('keydown',event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); $('rbStatus').open = false; $('rbStatusSummary').focus();
    });
    $('rbStatus').addEventListener('focusout',event => {
      if (!$('rbStatus').contains(event.relatedTarget)) $('rbStatus').open = false;
    });
    document.addEventListener('click',event => { if (!$('rbStatus').contains(event.target)) $('rbStatus').open = false; });
  }
  function metricMarkup(key,label,count,note,status) {
    return '<div data-rb-metric="'+key+'"><span>'+label+'</span><button type="button" class="rb-metric-link '+(status === 'pending' ? 'rb-metric-pending' : '')+'" data-rb-filter="'+status+'" aria-controls="rbResults" aria-pressed="false" aria-label="'+label+' '+count+'，点击查看对应抽取结果" title="点击查看对应抽取结果"><strong>'+count+'</strong></button><small>'+note+'</small></div>';
  }
  /** 数字选中态只代表完整的对应结果集，有关键词或细分审核状态时不误标。 */
  function syncMetricSelection() {
    $('rbSummary').querySelectorAll('[data-rb-filter]').forEach(button => {
      const statuses = metricStatuses[button.dataset.rbFilter];
      const active = !S.query.trim() && statuses.length === S.statuses.length && statuses.every(status => S.statuses.includes(status));
      button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
    });
  }
  function filterByMetric(status) {
    if (!['all','reviewed','pending'].includes(status)) return;
    if (K.pageTab !== 'extraction' || K.pageGraphId !== S.ontologyId || !currentOntology()) return;
    // 清除关键词和跨页勾选，使列表总量与点击数字一致，不改变本体及左侧类型范围。
    S.statuses = [...metricStatuses[status]]; S.query = '';
    $('rbStatus').open = false; syncStatusFilter(); $('rbSearch').value = '';
    resetSelection(); renderSummary(); renderTable();
    $('rbSummary').querySelector('[data-rb-filter="'+status+'"]').focus({preventScroll:true});
  }
  /** 用十分之一百分点分配舍入余数，非空时三段显示值恰好合计 100%。 */
  function distributionPercentages(counts) {
    const total = counts.reduce((sum,count) => sum+count,0);
    if (!total) return [0,0,0];
    const exact = counts.map(count => count/total*1000), units = exact.map(Math.floor);
    const order = exact.map((value,index) => ({index,remainder:value-units[index]})).sort((a,b) => b.remainder-a.remainder || a.index-b.index);
    const remaining = 1000-units.reduce((sum,value) => sum+value,0);
    for (let index = 0; index < remaining; index++) units[order[index].index]++;
    return units.map(value => value/10);
  }
  function distributionMarkup(rows) {
    const counts = ['high','medium','low'].map(band => rows.filter(item => confidenceBand(item) === band).length);
    const values = distributionPercentages(counts), names = ['高','中','低'], bands = ['high','medium','low'];
    const description = rows.length ? names.map((name,index) => name+'置信度 '+counts[index]+' 条，占 '+values[index]+'%').join('；') : '暂无抽取结果，置信度占比均为 0%';
    return '<div class="rb-distribution"><span>置信度分布</span><div class="rb-distribution-chart"><div class="rb-donut '+(!rows.length ? 'is-empty' : '')+'" role="img" aria-label="'+description+'" style="--high-end:'+values[0]+'%;--medium-end:'+(values[0]+values[1])+'%"><div><strong>'+rows.length+'</strong><small>'+(rows.length ? '条结果' : '暂无数据')+'</small></div></div>'+
      '<ul class="rb-donut-legend">'+counts.map((count,index) => '<li data-confidence-band="'+bands[index]+'"><i class="'+bands[index]+'"></i><span>'+names[index]+'</span><b>'+values[index]+'%</b><small>'+count+' 条</small></li>').join('')+'</ul></div></div>';
  }
  function typeButton(type,depth = 1) {
    const count = R.rows({...options(),typeId:type.id}).length;
    return '<button class="rb-tree-item '+(S.typeId === type.id ? 'active' : '')+'" data-rb-type="'+esc(type.id)+'" style="--depth:'+depth+'"><span>'+esc(type.name)+'</span><small>'+count+'</small></button>';
  }
  function entityTree(config,parentId = null,depth = 1) {
    if (depth > 5) return '';
    return config.entities.filter(item => (item.parentId || null) === parentId).map(item => typeButton(item,depth)+entityTree(config,item.id,depth+1)).join('');
  }
  function renderTree() {
    const config = currentOntology()?.config;
    if (!config) { $('rbTree').innerHTML = ''; return; }
    $('rbTree').innerHTML = '<div class="rb-tree-heading"><strong>本体类型</strong><span>抽取数</span></div><div class="rb-kind-tabs"><button data-rb-kind="entities" class="'+(S.kind === 'entities' ? 'active' : '')+'">实体类</button><button data-rb-kind="relations" class="'+(S.kind === 'relations' ? 'active' : '')+'">关系</button></div>'+
      '<button class="rb-tree-item rb-all '+(!S.typeId ? 'active' : '')+'" data-rb-type=""><span>全部'+(S.kind === 'entities' ? '实体' : '关系')+'</span><small>'+R.rows({...options(),typeId:''}).length+'</small></button>'+
      (S.kind === 'entities' ? entityTree(config) : config.relations.map(item => typeButton(item)).join(''))+
      (S.kind === 'entities' ? '<label class="rb-descendants"><input type="checkbox" id="rbIncludeChildren" '+(S.includeChildren ? 'checked' : '')+'>包含子类型</label>' : '');
  }
  function renderSummary() {
    const rows = R.rows(options());
    const reviewed = rows.filter(item => ['approved','rejected'].includes(item.status)).length;
    const documents = new Set(rows.flatMap(item => item.sources.map(source => source.documentId)).filter(Boolean));
    const title = S.typeId ? R.typeName(S.ontologyId,S.kind,S.typeId) : '全部'+(S.kind === 'entities' ? '实体类' : '关系');
    $('rbSummary').innerHTML = '<div class="rb-content-head"><div><h2>'+esc(title)+'</h2><p>已发布 v'+(currentOntology()?.version || '—')+' · '+(S.typeId && S.kind === 'entities' && S.includeChildren ? '包含子类型，结果去重统计' : '按当前类型范围统计')+'</p></div></div>'+
      '<div class="rb-metrics">'+metricMarkup('count',S.kind === 'entities' ? '实例抽取数量' : '关系抽取数量',rows.length,'包含待审核及未通过结果','all')+
      metricMarkup('reviewed','已审核数',reviewed,'包含审核通过及未通过','reviewed')+
      metricMarkup('pending','待审核数',rows.filter(item => item.status === 'pending').length,'逐项或批量确认','pending')+
      '<div data-rb-metric="documents"><span>来源文档数</span><strong>'+documents.size+'<em>篇</em></strong><small>按结果来源文档去重</small></div>'+
      distributionMarkup(rows)+'</div>'+
      '<p class="rb-metric-help">点击前三项数字可清除关键词并查看对应结果，审核状态同步切换。指标按当前类型范围统计，不受列表筛选影响；来源文档去重。高 ≥90%，中 ≥60% 且＜90%，低＜60%。</p>';
  }
  function taskSourceMarkup(item) {
    const task = sourceTask(item);
    return task ? '<button class="link-btn rb-task-source" data-rb-task-source="'+esc(item.id)+'" title="'+esc(task.name)+'">'+esc(task.name)+'</button>' : '<span class="help">暂无记录</span>';
  }
  /** 点击时重新核对结果和任务仍属于当前本体，失效链接不打开其他任务。 */
  function openSourceTask(id) {
    const item = R[S.kind].find(record => record.id === id && record.ontologyId === S.ontologyId);
    const task = item && sourceTask(item);
    if (!task) { K.notify('该结果暂无可查看的来源任务记录。'); renderTable(); return; }
    K.extractionUI.openDetail(task.id);
  }
  function rowMarkup(item) {
    const type = R.typeName(S.ontologyId,S.kind,item.typeId);
    const displayedSource = item.sources[0];
    const identity = S.kind === 'entities' ? '<td><button class="link-btn rb-name" data-rb-detail="'+item.id+'">'+esc(item.name)+'</button></td><td>'+esc(type)+'</td>' :
      '<td>'+esc(type)+'</td><td>'+esc(R.entity(item.fromId)?.name || '实体已移除')+'</td><td>'+esc(R.entity(item.toId)?.name || '实体已移除')+'</td>';
    return '<tr data-result-id="'+item.id+'"><td><input type="checkbox" data-rb-select="'+item.id+'" '+(S.selected.has(item.id) ? 'checked' : '')+' '+(item.status !== 'pending' ? 'disabled' : '')+' aria-label="选择'+esc(nameOf(item))+'"></td>'+identity+
      '<td>'+confidence(item)+'</td><td><div class="rb-properties">'+propertyTags(item)+'</div></td><td><button class="link-btn rb-source" data-rb-detail="'+item.id+'">'+esc(displayedSource?.title || '暂无来源')+'</button><small class="ex-secondary">'+(displayedSource ? '第 '+displayedSource.page+' 页' : '')+(item.sources.length > 1 ? ' · 共 '+item.sources.length+' 处依据' : '')+'</small></td><td>'+taskSourceMarkup(item)+'</td><td>'+statusTag(item)+'</td><td class="rb-actions">'+
      (item.status === 'pending' ? '<button class="link-btn" data-rb-review="'+item.id+'">审核</button>' : '')+'<button class="link-btn" data-rb-detail="'+item.id+'">详情</button></td></tr>';
  }
  function renderTable() {
    syncMetricSelection();
    const rows = filterRows(), pageCount = Math.max(1,Math.ceil(rows.length/pageSize));
    S.page = Math.min(S.page,pageCount);
    const current = rows.slice((S.page-1)*pageSize,S.page*pageSize);
    const legalIds = new Set(rows.filter(item => item.status === 'pending').map(item => item.id));
    S.selected.forEach(id => { if (!legalIds.has(id)) S.selected.delete(id); });
    const heads = S.kind === 'entities' ? '<th>实例名称</th><th>所属类型</th>' : '<th>关系类型</th><th>原实体</th><th>目标实体</th>';
    $('rbResults').innerHTML = '<div class="rb-table-toolbar"><strong>抽取结果 <span>'+rows.length+'</span></strong><div><button class="btn small" data-rb-action="approve-selected" '+(!S.selected.size ? 'disabled' : '')+'>批量通过 ('+S.selected.size+')</button><button class="btn small" data-rb-action="reject-selected" '+(!S.selected.size ? 'disabled' : '')+'>批量不通过</button></div></div>'+
      '<div class="rb-table-scroll"><table class="rb-table '+(S.kind === 'relations' ? 'relations' : '')+'"><thead><tr><th><input type="checkbox" id="rbSelectPage" aria-label="选择本页待审核结果"></th>'+heads+'<th>置信度</th><th>属性值</th><th>文档来源</th><th>任务来源</th><th>审核状态</th><th>操作</th></tr></thead><tbody>'+current.map(rowMarkup).join('')+'</tbody></table>'+
      (!rows.length ? '<div class="ex-empty"><h3>暂无符合条件的抽取结果</h3><p>可以清除筛选，或创建任务补充抽取。</p><button class="btn" data-rb-action="reset">清除筛选</button></div>' : '')+'</div>'+
      '<div class="ex-pagination"><span>共 '+rows.length+' 条 · 第 '+S.page+' / '+pageCount+' 页</span><button class="btn small" data-rb-action="prev" '+(S.page<=1?'disabled':'')+'>上一页</button><button class="btn small" data-rb-action="next" '+(S.page>=pageCount?'disabled':'')+'>下一页</button></div>';
    const pending = current.filter(item => item.status === 'pending');
    $('rbSelectPage').checked = Boolean(pending.length && pending.every(item => S.selected.has(item.id)));
    $('rbSelectPage').disabled = !pending.length;
    $('rbSelectPage').indeterminate = pending.some(item => S.selected.has(item.id)) && !$('rbSelectPage').checked;
  }
  function render() {
    normalize();
    const available = X.ontologies();
    $('rbOntology').innerHTML = available.map(item => '<option value="'+esc(item.id)+'">'+esc(item.name)+' · v'+item.version+'</option>').join('') || '<option value="">暂无已发布本体</option>';
    $('rbOntology').value = S.ontologyId; $('rbOntology').disabled = !available.length;
    $('rbBoardEmpty').hidden = Boolean(available.length); $('rbWorkspace').hidden = !available.length;
    syncStatusFilter(); $('rbSearch').value = S.query;
    renderTree(); renderSummary(); renderTable();
    $('extractionBoardView').hidden = false;
  }
  function resetSelection() { S.selected.clear(); S.page = 1; }
  function resetFilters() {
    S.statuses = []; S.query = '';
    $('rbStatus').open = false; syncStatusFilter();
    $('rbSearch').value = ''; resetSelection(); renderTable();
  }
  function openDetail(id,review = false) {
    const item = R[S.kind].find(record => record.id === id); if (!item) return;
    detailId = id;
    $('rbDetailTitle').textContent = (review ? '审核' : '详情')+' · '+nameOf(item);
    $('rbDetailBody').innerHTML = '<div class="rb-detail-meta">'+statusTag(item)+'<span>'+esc(R.typeName(item.ontologyId,S.kind,item.typeId))+'</span><span>置信度 '+item.confidence+'%</span></div>'+
      '<h3>属性信息</h3><dl class="rb-attribute-list">'+Object.entries(item.properties || {}).map(([key,value]) => '<dt>'+esc(key)+'</dt><dd>'+esc(value || '未提供')+'</dd>').join('')+'</dl>'+
      '<h3>文档来源与原文依据</h3>'+item.sources.map(source => '<article class="rb-evidence"><strong>'+esc(source.title)+'</strong><span>第 '+esc(source.page)+' 页</span><blockquote>'+esc(source.quote)+'</blockquote></article>').join('')+
      '<p class="help">文档摘录为页面示例内容；这里保留抽取时的来源，不代表真实诊疗建议。</p>'+
      (item.reviewedAt ? '<h3>审核记录</h3><p>'+esc(item.reviewedAt)+' · '+esc(item.reviewRemark || '审核通过')+'</p>' : '');
    $('rbApprove').hidden = $('rbReject').hidden = item.status !== 'pending';
    $('rbResultDialog').showModal();
  }
  function approve(ids) {
    K.confirm({title:'确认通过这 '+ids.length+' 条结果？',text:'通过后进入后续融合处理，仍需验证与人工确认，不会自动合并已有知识。',label:'确认通过',action:() => {
      const error = R.review(S.kind,ids,'approved');
      if (error) { K.notify(error); return; }
      S.selected.clear(); $('rbResultDialog').close(); render(); K.notify('所选结果已通过审核');
    }});
  }
  function reject(ids) {
    reviewIds = ids; $('rbRejectReason').value = ''; $('rbRejectError').hidden = true; $('rbRejectDialog').showModal();
  }
  function handleClick(event) {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.rbFilter) filterByMetric(button.dataset.rbFilter);
    if (button.hasAttribute('data-rb-type')) { S.typeId = button.dataset.rbType; resetSelection(); renderTree(); renderSummary(); renderTable(); }
    if (button.dataset.rbKind) { S.kind = button.dataset.rbKind; S.typeId = ''; resetSelection(); render(); }
    if (button.dataset.rbDetail) openDetail(button.dataset.rbDetail);
    if (button.dataset.rbReview) openDetail(button.dataset.rbReview,true);
    if (button.dataset.rbTaskSource) openSourceTask(button.dataset.rbTaskSource);
    const action = button.dataset.rbAction;
    if (action === 'approve-selected') approve([...S.selected]);
    if (action === 'reject-selected') reject([...S.selected]);
    if (action === 'reset') resetFilters();
    if (action === 'prev' || action === 'next') { S.page += action === 'next' ? 1 : -1; renderTable(); }
  }
  function showView(view) { render(); if (view === 'tasks') K.extractionUI.openRecords(); }
  /** 质检回到抽取时保留问题所属本体，避免落到另一领域的数据中。 */
  function focusOntology(id) {
    if (!X.ontologies().some(item => item.id === id)) return false;
    S.ontologyId = id; S.kind = 'entities'; S.typeId = '';
    resetFilters(); render(); K.extractionUI.render(); return true;
  }
  function initDialogs() {
    document.body.insertAdjacentHTML('beforeend','<dialog id="rbResultDialog" class="ex-task-drawer"><div class="dialog-layout"><header class="dialog-header"><h2 id="rbDetailTitle"></h2><button class="close" data-rb-close="rbResultDialog" aria-label="关闭结果详情">×</button></header><div class="dialog-body" id="rbDetailBody"></div><footer class="dialog-footer"><button class="btn" data-rb-close="rbResultDialog">关闭</button><button class="btn" id="rbReject">不通过</button><button class="btn primary" id="rbApprove">审核通过</button></footer></div></dialog>'+
      '<dialog id="rbRejectDialog" class="confirm-dialog"><form id="rbRejectForm"><header class="dialog-header"><h2>审核不通过</h2><button type="button" class="close" data-rb-close="rbRejectDialog" aria-label="关闭审核意见">×</button></header><div class="dialog-body"><label for="rbRejectReason">不通过原因 <span class="required">*</span></label><textarea id="rbRejectReason" rows="4" maxlength="200" placeholder="请说明需要核实或修正的内容"></textarea><p id="rbRejectError" class="form-error" hidden></p></div><footer class="dialog-footer"><button type="button" class="btn" data-rb-close="rbRejectDialog">取消</button><button class="btn danger-fill" type="submit">确认不通过</button></footer></form></dialog>');
    document.querySelectorAll('[data-rb-close]').forEach(button => button.addEventListener('click',() => $(button.dataset.rbClose).close()));
    $('rbApprove').addEventListener('click',() => approve([detailId])); $('rbReject').addEventListener('click',() => reject([detailId]));
    $('rbRejectForm').addEventListener('submit',event => {
      event.preventDefault();
      const error = R.review(S.kind,reviewIds,'rejected',$('rbRejectReason').value);
      if (error) { $('rbRejectError').textContent = error; $('rbRejectError').hidden = false; return; }
      $('rbRejectDialog').close(); $('rbResultDialog').close(); S.selected.clear(); render(); K.notify('审核意见已保存');
    });
  }
  function init() {
    initDialogs();
    $('extractionBoardView').addEventListener('click',handleClick);
    $('rbOntology').addEventListener('change',event => { S.ontologyId = event.target.value; S.typeId = ''; resetFilters(); render(); K.extractionUI.render(); });
    initStatusFilter();
    $('rbSearch').addEventListener('input',event => { S.query = event.target.value; resetSelection(); renderTable(); });
    $('rbResetFilters').addEventListener('click',resetFilters);
    $('rbResultFilters').addEventListener('submit',event => { event.preventDefault(); S.query = $('rbSearch').value; resetSelection(); renderTable(); });
    $('extractionBoardView').addEventListener('change',event => {
      const target = event.target;
      if (target.id === 'rbIncludeChildren') { S.includeChildren = target.checked; resetSelection(); renderTree(); renderSummary(); renderTable(); }
      if (target.dataset.rbSelect) { target.checked ? S.selected.add(target.dataset.rbSelect) : S.selected.delete(target.dataset.rbSelect); renderTable(); }
      if (target.id === 'rbSelectPage') { filterRows().slice((S.page-1)*pageSize,S.page*pageSize).filter(item => item.status === 'pending').forEach(item => { target.checked ? S.selected.add(item.id) : S.selected.delete(item.id); }); renderTable(); }
    });
    document.addEventListener('kg:results-change',render);
    document.addEventListener('kg:extraction-change',render);
    render();
  }
  K.resultsUI = {init,render,showView,focusOntology,ontologyId:() => S.ontologyId,isBoard:() => true};
})();
