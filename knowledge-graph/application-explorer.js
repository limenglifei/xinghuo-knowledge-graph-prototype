/* 图谱浏览只读取质检报告副本；查询、探索与导出共享结果，不修改知识图谱。 */
(() => {
  const K = window.KG, esc = K.escape;
  const viewport = {width:900,height:500};
  let active = null;
  const q = selector => active?.container.querySelector(selector);
  const text = value => typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  const entityType = entity => active.report.config.entities.find(type => type.id === entity.typeId)?.name || '未知类型';
  const relationType = relation => active.report.config.relations.find(type => type.id === relation.typeId)?.name || relation.name || '未知关系';
  const name = id => active.entities.find(entity => entity.id === id)?.name || '未知实体';
  const confidence = record => record.confidence != null && record.confidence !== '' && Number.isFinite(Number(record.confidence)) ? Number(record.confidence) + '%' : '暂无记录';
  const sources = record => Array.isArray(record.sources) ? record.sources.filter(source => source && typeof source === 'object') : [];
  const props = record => Object.entries(record.properties || {}).map(([key,value]) => key + '：' + text(value)).join('；') || '暂无属性';
  const documents = record => [...new Set(sources(record).map(source => source.title).filter(Boolean))].join('、') || '暂无文档来源';
  const initialQuery = () => ({keyword:'',entityType:'',relationType:''});

  function options(types) {
    return types.map(type => `<option value="${esc(type.id)}">${esc(type.name)}</option>`).join('');
  }
  function markup() {
    return `<section class="ga-explorer" aria-label="图谱浏览与探索"><form class="ga-query" data-ga="query-form"><label class="ga-keyword">关键词<input data-ga="keyword" type="search" maxlength="50" placeholder="搜索实体名称或属性" aria-label="图谱关键词"></label><label>实体类型<select data-ga="entity-type" aria-label="图谱实体类型"><option value="">全部类型</option>${options(active.report.config.entities)}</select></label><label>关系类型<select data-ga="relation-type" aria-label="图谱关系类型"><option value="">全部关系</option>${options(active.report.config.relations)}</select></label><button class="btn primary" type="submit">查询</button><button class="btn" type="button" data-ga-action="reset">重置</button><button class="btn ga-export" type="button" data-ga-action="export">导出当前结果</button></form><p class="ga-query-note">查询后生效。关键词匹配实体名称与属性；选择关系类型后，仅保留命中的连线及其两端实体。</p><div class="ga-workspace"><section class="ga-graph"><header><div><h3>图谱可视化</h3><p data-ga="count" aria-live="polite"></p></div><div class="ga-view-actions"><button class="btn small" type="button" data-ga-action="zoom-out" aria-label="缩小图谱">−</button><span data-ga="zoom">100%</span><button class="btn small" type="button" data-ga-action="zoom-in" aria-label="放大图谱">＋</button><button class="btn small" type="button" data-ga-action="fit">适应画布</button></div></header><div class="ga-board"><svg data-ga="canvas" viewBox="0 0 900 500" role="group" aria-label="当前结果图谱，选择实体可查看详情"></svg><div class="ga-empty" data-ga="empty" hidden><strong>没有符合条件的实体</strong><p>调整查询条件，或重置后查看整个图谱。</p><button class="btn" type="button" data-ga-action="reset">重置查询</button></div></div><footer><span>拖动画布移动 · 滚轮缩放 · 点击实体查看详情</span><button class="link-btn" type="button" data-ga-action="full">返回全图</button></footer></section><aside class="ga-sidebar" data-ga="sidebar" aria-label="实体详情与关联探索"></aside></div><p class="ga-scope" data-ga="scope" aria-live="polite"></p><section class="ga-results"><header><nav aria-label="图谱结果类型"><button type="button" data-ga-tab="entities"></button><button type="button" data-ga-tab="relations"></button></nav><span>列表与画布、导出范围一致</span></header><div class="ga-table-wrap" data-ga="table"></div></section><p class="ga-message" data-ga="message" role="status" hidden></p></section>`;
  }
  /** 先形成查询结果，再在此范围内探索；不混入其它版本或未命中条件的数据。 */
  function queryResult() {
    const query = active.query, keyword = query.keyword.toLocaleLowerCase();
    let entities = active.entities.filter(entity => (!query.entityType || entity.typeId === query.entityType) &&
      (!keyword || [entity.name,props(entity)].join(' ').toLocaleLowerCase().includes(keyword)));
    const ids = new Set(entities.map(entity => entity.id));
    const relations = active.relations.filter(relation => ids.has(relation.fromId) && ids.has(relation.toId) && (!query.relationType || relation.typeId === query.relationType));
    if (query.relationType) {
      const connected = new Set(relations.flatMap(relation => [relation.fromId,relation.toId]));
      entities = entities.filter(entity => connected.has(entity.id));
    }
    return {entities,relations};
  }
  function exploredResult(base) {
    const exploration = active.exploration;
    if (!exploration) return base;
    const visited = new Set([exploration.rootId]), traversed = new Set(); let frontier = new Set(visited);
    for (let hop = 0; hop < exploration.depth; hop++) {
      const next = new Set();
      base.relations.forEach(relation => {
        if (exploration.direction !== 'in' && frontier.has(relation.fromId)) { traversed.add(relation.id); if (!visited.has(relation.toId)) next.add(relation.toId); }
        if (exploration.direction !== 'out' && frontier.has(relation.toId)) { traversed.add(relation.id); if (!visited.has(relation.fromId)) next.add(relation.fromId); }
      });
      next.forEach(id => visited.add(id)); frontier = next;
    }
    return {entities:base.entities.filter(entity => visited.has(entity.id)),relations:base.relations.filter(relation => traversed.has(relation.id) && visited.has(relation.fromId) && visited.has(relation.toId))};
  }
  function positions() {
    const entities = active.result.entities, groups = [...new Set(entities.map(entity => entity.typeId))], points = new Map();
    const columns = groups.length === 1 ? Math.max(1,Math.ceil(Math.sqrt(entities.length))) : groups.length;
    let rows = 1;
    groups.forEach((type,index) => {
      const members = entities.filter(entity => entity.typeId === type);
      members.forEach((entity,row) => {
        const column = groups.length === 1 ? row % columns : index;
        const line = groups.length === 1 ? Math.floor(row / columns) : row;
        points.set(entity.id,{x:130 + column * 250,y:100 + line * 130}); rows = Math.max(rows,line + 1);
      });
    });
    return {points,width:Math.max(300,columns * 250 + 10),height:Math.max(250,rows * 130 + 90)};
  }
  function edgeMarkup(relation,index) {
    const from = active.layout.points.get(relation.fromId), to = active.layout.points.get(relation.toId), label = relationType(relation);
    if (!from || !to) return '';
    let path, x, y;
    if (relation.fromId === relation.toId) {
      path = `M${from.x - 17},${from.y - 20} C${from.x - 85},${from.y - 95} ${from.x + 85},${from.y - 95} ${from.x + 17},${from.y - 20}`; x = from.x; y = from.y - 72;
    } else {
      const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx,dy), vertical = Math.abs(dx) < 1;
      const bend = vertical ? 118 + index % 3 * 18 : 34 + index % 3 * 20;
      const cx = (from.x + to.x) / 2 - dy / length * bend, cy = (from.y + to.y) / 2 + dx / length * bend;
      path = `M${from.x + dx / length * 28},${from.y + dy / length * 28} Q${cx},${cy} ${to.x - dx / length * 30},${to.y - dy / length * 30}`;
      x = (from.x + 2 * cx + to.x) / 4; y = (from.y + 2 * cy + to.y) / 4 - (vertical ? 0 : 8);
    }
    return `<g class="ga-edge" data-ga-relation="${esc(relation.id)}"><title>${esc(name(relation.fromId) + ' → ' + label + ' → ' + name(relation.toId))}</title><path d="${path}" marker-end="url(#gaExplorerArrow)"/><text x="${x}" y="${y}" text-anchor="middle">${esc(label)}</text></g>`;
  }
  function nodeMarkup(entity) {
    const point = active.layout.points.get(entity.id), type = active.report.config.entities.find(type => type.id === entity.typeId);
    const color = /^#[0-9a-f]{6}$/i.test(type?.color || '') ? type.color : '#5b8ff9';
    const label = text(entity.name) || '未命名实体', short = [...label].length > 14 ? [...label].slice(0,13).join('') + '…' : label;
    return `<g class="ga-node${active.selectedId === entity.id ? ' ga-selected' : ''}" data-ga-node="${esc(entity.id)}" tabindex="0" role="button" aria-label="查看实体 ${esc(label)}" transform="translate(${point.x},${point.y})"><title>${esc(label + ' · ' + entityType(entity))}</title><circle r="25" fill="#fff" stroke="${color}"/><circle r="18" fill="${color}" fill-opacity=".12" stroke="none"/><text text-anchor="middle" y="5" fill="${color}">${esc((type?.name || '实体').slice(0,2))}</text><text class="ga-node-name" text-anchor="middle" y="47">${esc(short)}</text></g>`;
  }
  function drawGraph() {
    q('[data-ga="canvas"]').innerHTML = `<defs><marker id="gaExplorerArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a5b6d1"/></marker></defs><g data-ga="world">${active.result.relations.map(edgeMarkup).join('')}${active.result.entities.map(nodeMarkup).join('')}</g>`;
    q('[data-ga="empty"]').hidden = active.result.entities.length > 0;
    fit();
  }
  function transform() {
    q('[data-ga="world"]')?.setAttribute('transform',`translate(${active.pan.x},${active.pan.y}) scale(${active.zoom})`);
    q('[data-ga="zoom"]').textContent = Math.round(active.zoom * 100) + '%';
  }
  function fit() {
    if (!active) return;
    active.zoom = Math.min((viewport.width - 70) / active.layout.width,(viewport.height - 65) / active.layout.height,1.35);
    active.pan = {x:(viewport.width - active.layout.width * active.zoom) / 2,y:(viewport.height - active.layout.height * active.zoom) / 2};
    transform();
  }
  function zoom(factor) {
    const value = Math.max(Math.min(.08,active.zoom),Math.min(4,active.zoom * factor));
    const ratio = value / active.zoom;
    active.pan = {x:viewport.width / 2 - (viewport.width / 2 - active.pan.x) * ratio,y:viewport.height / 2 - (viewport.height / 2 - active.pan.y) * ratio};
    active.zoom = value; transform();
  }
  function sourceMarkup(source) {
    return `<article class="ga-source"><strong>${esc(source.title || '未命名文档')}</strong><small>第 ${esc(source.page || 1)} 页</small><blockquote>${esc(source.quote || '暂无原文摘录')}</blockquote></article>`;
  }
  function renderSidebar() {
    const entity = active.result.entities.find(entity => entity.id === active.selectedId);
    if (!entity) { q('[data-ga="sidebar"]').innerHTML = '<h3>实体详情</h3><p class="ga-hint">点击图谱中的实体，或下方结果列表中的实体名称，查看属性、文档来源并探索关联。</p>'; return; }
    q('[data-ga="sidebar"]').innerHTML = `<h3>${esc(entity.name || '未命名实体')}</h3><dl class="ga-facts"><dt>所属类型</dt><dd>${esc(entityType(entity))}</dd><dt>置信度</dt><dd>${esc(confidence(entity))}</dd></dl><section class="ga-explore-controls"><h4>关联探索</h4><div><label>关联范围<select data-ga="depth" aria-label="关联探索跳数"><option value="1">1 跳关联</option><option value="2">2 跳关联</option></select></label><label>方向<select data-ga="direction" aria-label="关联探索方向"><option value="both">双向</option><option value="out">出向</option><option value="in">入向</option></select></label></div><button class="btn primary" type="button" data-ga-action="explore">探索此实体关联</button><p>在当前查询范围内探索。1 跳为直接关联，2 跳包含通过一个中间实体建立的关联。</p></section><h4>属性</h4><dl class="ga-properties">${Object.entries(entity.properties || {}).map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(text(value) || '未提供')}</dd>`).join('') || '<dd>暂无属性</dd>'}</dl><h4>文档来源</h4>${sources(entity).map(sourceMarkup).join('') || '<p class="ga-hint">暂无文档来源</p>'}`;
    if (active.exploration) { q('[data-ga="depth"]').value = String(active.exploration.depth); q('[data-ga="direction"]').value = active.exploration.direction; }
  }
  function entityLink(id) { return `<button type="button" class="link-btn" data-ga-node="${esc(id)}">${esc(name(id))}</button>`; }
  function renderTable() {
    const relationTab = active.tab === 'relations', records = active.result[active.tab];
    active.container.querySelectorAll('[data-ga-tab]').forEach(button => {
      const type = button.dataset.gaTab; button.textContent = (type === 'entities' ? '实体' : '关系') + '（' + active.result[type].length + '）';
      button.classList.toggle('active',type === active.tab); button.setAttribute('aria-pressed',String(type === active.tab));
    });
    if (!records.length) { q('[data-ga="table"]').innerHTML = `<p class="ga-table-empty">${relationTab ? '当前结果中没有关系' : '当前没有符合条件的实体'}</p>`; return; }
    const header = relationTab ? '<th>关系类型</th><th>原实体 → 目标实体</th>' : '<th>实体名称</th><th>所属类型</th>';
    q('[data-ga="table"]').innerHTML = `<table class="ga-table"><thead><tr>${header}<th>置信度</th><th>属性</th><th>文档来源</th></tr></thead><tbody>${records.map(record => `<tr data-ga-row="${esc(record.id)}">${relationTab ? `<td>${esc(relationType(record))}</td><td>${entityLink(record.fromId)}<span class="ga-direction-arrow"> → </span>${entityLink(record.toId)}</td>` : `<td>${entityLink(record.id)}</td><td>${esc(entityType(record))}</td>`}<td>${esc(confidence(record))}</td><td>${esc(props(record))}</td><td>${esc(documents(record))}</td></tr>`).join('')}</tbody></table>`;
  }
  function update() {
    active.result = exploredResult(queryResult());
    if (!active.result.entities.some(entity => entity.id === active.selectedId)) active.selectedId = null;
    active.layout = positions();
    q('[data-ga="count"]').textContent = `${active.result.entities.length} 个实体 · ${active.result.relations.length} 条关系`;
    const directions = {both:'双向',in:'入向',out:'出向'}, exploration = active.exploration;
    const range = exploration ? `关联探索：${name(exploration.rootId)} · ${exploration.depth} 跳 · ${directions[exploration.direction]}（当前查询范围内）` : Object.values(active.query).some(Boolean) ? '当前展示查询结果；修改条件后点击“查询”更新。' : '当前展示报告中的全部实体与有效关系。';
    q('[data-ga="scope"]').textContent = range;
    q('[data-ga-action="export"]').disabled = active.result.entities.length === 0;
    q('[data-ga="message"]').hidden = true; q('[data-ga="message"]').classList.remove('warning');
    drawGraph(); renderSidebar(); renderTable();
    highlightIssue();
  }
  function reset() {
    active.query = initialQuery(); active.exploration = null; active.selectedId = null; active.issueFocus = null;
    ['keyword','entity-type','relation-type'].forEach(field => { q('[data-ga="' + field + '"]').value = ''; });
    update();
  }
  function selectEntity(id) {
    if (!active?.result.entities.some(entity => entity.id === id)) return false;
    active.selectedId = id; renderSidebar();
    active.container.querySelectorAll('.ga-node').forEach(node => node.classList.toggle('ga-selected',node.dataset.gaNode === id));
    return true;
  }
  function showMessage(message,warning = false) {
    if (!active) return;
    q('[data-ga="message"]').textContent = message;
    q('[data-ga="message"]').classList.toggle('warning',warning); q('[data-ga="message"]').hidden = false;
  }
  function highlightIssue() {
    if (!active) return;
    active.container.querySelectorAll('.ga-node').forEach(node => node.classList.toggle('ga-issue-focus',Boolean(active.issueFocus?.entityIds.has(node.dataset.gaNode))));
    active.container.querySelectorAll('.ga-edge').forEach(edge => edge.classList.toggle('ga-issue-focus',Boolean(active.issueFocus?.relationIds.has(edge.dataset.gaRelation))));
    active.container.querySelectorAll('[data-ga-row]').forEach(row => row.classList.toggle('ga-issue-row',Boolean(active.issueFocus?.entityIds.has(row.dataset.gaRow) || active.issueFocus?.relationIds.has(row.dataset.gaRow))));
  }
  function centerOn(ids) {
    const points = ids.map(id => active.layout.points.get(id)).filter(Boolean); if (!points.length) return;
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    active.zoom = Math.min(1.5,700 / Math.max(250,right - left + 150),340 / Math.max(220,bottom - top + 130));
    active.pan = {x:viewport.width / 2 - (left + right) / 2 * active.zoom,y:viewport.height / 2 - (top + bottom) / 2 * active.zoom}; transform();
  }
  /** 外部定位允许清除遮住目标的筛选，但从不按名称猜测目标。 */
  function revealEntity(id) {
    if (!active || !active.entities.some(entity => entity.id === id)) return false;
    if (!active.result.entities.some(entity => entity.id === id)) reset();
    selectEntity(id); centerOn([id]); return true;
  }
  function checkedIssue(issue) {
    if (!active || !issue || (issue.reportId && issue.reportId !== active.report.reportId) || (issue.ontologyId && issue.ontologyId !== active.report.ontologyId)) return null;
    if (!issue.id || !Array.isArray(active.report.issues)) return issue;
    const found = active.report.issues.find(value => value.id === issue.id);
    return found && (!issue.recordId || found.recordId === issue.recordId) && (!issue.kind || found.kind === issue.kind) ? found : null;
  }
  /** 质量问题按本报告中的实体和关系定位；缺失端点不伪造实体或连线。 */
  function focusIssue(input) {
    const issue = checkedIssue(input);
    if (!issue) { showMessage('当前报告中没有该问题的定位信息，请重新查看问题详情。',true); return false; }
    const relationIds = new Set([...(issue.relationIds || []),...(issue.kind === 'relation' && issue.recordId ? [issue.recordId] : [])]);
    const relations = active.report.relations.filter(relation => relationIds.has(relation.id));
    const entityIds = new Set([...(issue.entityIds || []),...(issue.kind === 'entity' && issue.recordId ? [issue.recordId] : []),...relations.flatMap(relation => [relation.fromId,relation.toId])].filter(Boolean));
    const existing = active.entities.filter(entity => entityIds.has(entity.id));
    if (!existing.length) { showMessage('该问题的实体或关系端点在本次报告中均已缺失，无法在图中定位，请核对问题详情。',true); return false; }
    reset(); active.issueFocus = {entityIds:new Set(existing.map(entity => entity.id)),relationIds};
    active.tab = issue.kind === 'relation' ? 'relations' : 'entities'; renderTable();
    selectEntity(existing[0].id); highlightIssue(); centerOn(existing.map(entity => entity.id));
    const missing = existing.length < entityIds.size;
    showMessage(missing ? '已定位仍存在的关联实体；缺失端点对应的关系未绘制，请结合问题详情核对。' : '已定位问题涉及的实体与关系；图中仍保留本报告的全量有效结果。',missing);
    return true;
  }
  function exportResult() {
    if (!active.result.entities.length) return;
    const report = active.report, payload = {metadata:{kind:'图谱当前浏览结果',exportedAt:new Date().toISOString(),reportId:report.reportId,reportVersion:report.reportVersion,qualityScore:report.score,reportMissingEndpointRelationCount:active.missingRelations.length,ontologyId:report.ontologyId,ontologyName:report.ontologyName,ontologyVersion:report.ontologyVersion,query:K.clone(active.query),exploration:K.clone(active.exploration),entityCount:active.result.entities.length,relationCount:active.result.relations.length},config:report.config,entities:active.result.entities,relations:active.result.relations};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = (report.ontologyName || '知识图谱').replace(/[\\/:*?"<>|]/g,'-') + '-当前结果.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    q('[data-ga="message"]').textContent = `已导出 ${active.result.entities.length} 个实体、${active.result.relations.length} 条关系，包含属性、文档来源及查询范围。`;
    q('[data-ga="message"]').hidden = false;
  }
  function click(event) {
    const node = event.target.closest('[data-ga-node]'); if (node) { selectEntity(node.dataset.gaNode); return; }
    const tab = event.target.closest('[data-ga-tab]'); if (tab) { active.tab = tab.dataset.gaTab; renderTable(); highlightIssue(); return; }
    const action = event.target.closest('[data-ga-action]')?.dataset.gaAction;
    if (action === 'reset' || action === 'full') reset();
    if (action === 'zoom-in') zoom(1.2); if (action === 'zoom-out') zoom(1 / 1.2);
    if (action === 'fit') fit(); if (action === 'export') exportResult();
    if (action === 'explore' && active.selectedId) {
      active.exploration = {rootId:active.selectedId,depth:Number(q('[data-ga="depth"]').value),direction:q('[data-ga="direction"]').value}; active.issueFocus = null; update();
    }
  }
  function pointer(event) {
    const canvas = q('[data-ga="canvas"]');
    if (event.type === 'pointerdown') {
      if (event.button !== 0 || event.target.closest('[data-ga-node]')) return;
      active.drag = {id:event.pointerId,x:event.clientX,y:event.clientY,pan:{...active.pan}}; canvas.setPointerCapture(event.pointerId);
    } else if (event.type === 'pointermove' && active.drag?.id === event.pointerId) {
      const box = canvas.getBoundingClientRect(), scale = Math.min(box.width / viewport.width,box.height / viewport.height);
      active.pan = {x:active.drag.pan.x + (event.clientX - active.drag.x) / scale,y:active.drag.pan.y + (event.clientY - active.drag.y) / scale}; transform();
    } else if (['pointerup','pointercancel'].includes(event.type)) {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); active.drag = null;
    }
  }
  function bind() {
    const signal = active.controller.signal, container = active.container, canvas = q('[data-ga="canvas"]');
    container.addEventListener('click',click,{signal});
    container.addEventListener('keydown',event => { const node = event.target.closest('.ga-node'); if (node && ['Enter',' '].includes(event.key)) { event.preventDefault(); selectEntity(node.dataset.gaNode); } },{signal});
    q('[data-ga="query-form"]').addEventListener('submit',event => {
      event.preventDefault(); active.query = {keyword:q('[data-ga="keyword"]').value.trim(),entityType:q('[data-ga="entity-type"]').value,relationType:q('[data-ga="relation-type"]').value}; active.exploration = null; active.issueFocus = null; update();
    },{signal});
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(type => canvas.addEventListener(type,pointer,{signal}));
    canvas.addEventListener('wheel',event => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); },{signal,passive:false});
  }
  function clear() {
    if (!active) return;
    active.controller.abort(); active.container.replaceChildren(); active = null;
  }
  /** 每次报告变化均重新挂载；副本与布局状态隔离，浏览不会回写报告或抽取结果。 */
  function mount(container,report) {
    clear();
    const target = typeof container === 'string' ? document.querySelector(container) : container;
    if (!target || !report || !Array.isArray(report.entities) || !Array.isArray(report.relations)) return false;
    const snapshot = K.clone(report), entities = snapshot.entities;
    snapshot.config = {...snapshot.config,entities:Array.isArray(snapshot.config?.entities) ? snapshot.config.entities : [],relations:Array.isArray(snapshot.config?.relations) ? snapshot.config.relations : []};
    const ids = new Set(entities.map(entity => entity.id));
    const missingRelations = snapshot.relations.filter(relation => !ids.has(relation.fromId) || !ids.has(relation.toId));
    const relations = snapshot.relations.filter(relation => ids.has(relation.fromId) && ids.has(relation.toId) && !['rejected','merged'].includes(relation.status));
    active = {container:target,report:snapshot,entities,relations,missingRelations,query:initialQuery(),exploration:null,issueFocus:null,selectedId:null,tab:'entities',result:{entities,relations},controller:new AbortController(),pan:{x:0,y:0},zoom:1,drag:null};
    target.innerHTML = markup();
    if (missingRelations.length) q('.ga-query-note').insertAdjacentHTML('afterend',`<p class="ga-warning" data-ga="missing-relations">本报告有 ${missingRelations.length} 条关系缺少起点或终点，未纳入下方画布、结果列表和当前结果导出；原始记录仍保留在质检报告的问题明细中。</p>`);
    bind(); update(); return true;
  }
  K.applicationExplorer = {mount,clear,selectEntity:revealEntity,focusIssue};
})();
