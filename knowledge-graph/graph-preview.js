/* 本体预览只表达当前编辑内容，不模拟真实知识数据或发布结果。 */
(function () {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#3f6fff', '#18a17c', '#db9134', '#8c6bd1', '#dd6689', '#3293b1'];
  let instanceCount = 0;

  /** 业务名称仅以文本写入，防止被解析成页面内容。 */
  function svgElement(tag, attributes = {}, text) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function compactName(name, limit = 10) {
    const characters = Array.from(String(name || '未命名'));
    return characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : characters.join('');
  }

  /** 多实体时增加画布尺寸后自动适配，保留所有节点；用户可放大查看。 */
  function createLayout(entities) {
    if (entities.some(item => item.parentId)) return createHierarchyLayout(entities);
    const count = entities.length;
    const columns = Math.min(8, Math.ceil(Math.sqrt(count * 1.4)));
    const width = count <= 8 ? 620 : Math.max(620, columns * 164 + 100);
    const height = count <= 8 ? 480 : Math.max(480, Math.ceil(count / columns) * 142 + 160);
    const nodes = entities.map((entity, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      let x = width / 2;
      let y = height / 2;
      if (count === 2) x = 190 + index * 240;
      else if (count > 2 && count <= 8) { x += Math.cos(angle) * 207; y += Math.sin(angle) * 126; }
      else if (count > 8) { x = 132 + (index % columns) * 164; y = 132 + Math.floor(index / columns) * 142; }
      return { ...entity, x, y, color: /^#[0-9a-f]{3,8}$/i.test(entity.color || '') ? entity.color : COLORS[index % COLORS.length] };
    });
    return { width, height, nodes, byId: new Map(nodes.map(node => [String(node.id), node])) };
  }

  /** 有父子类型时按层级排列；业务关系仍独立绘制，避免把继承当成可抽取关系。 */
  function createHierarchyLayout(entities) {
    const byId = new Map(entities.map(item => [item.id,item]));
    const levels = new Map(), depths = new Map();
    entities.forEach(item => {
      const visited = new Set([item.id]); let current = item;
      while (current.parentId && byId.has(current.parentId) && !visited.has(current.parentId)) {
        visited.add(current.parentId); current = byId.get(current.parentId);
      }
      const depth = visited.size; depths.set(item.id,depth);
      if (!levels.has(depth)) levels.set(depth,[]);
      levels.get(depth).push(item);
    });
    const width = Math.max(620,...[...levels.values()].map(items => items.length * 170 + 70));
    const height = Math.max(480,Math.max(...levels.keys()) * 135 + 80);
    const nodes = entities.map((item,index) => {
      const depth = depths.get(item.id), peers = levels.get(depth);
      return {...item,x:width * (peers.indexOf(item) + 1) / (peers.length + 1),y:70 + (depth - 1) * 135,color:/^#[0-9a-f]{3,8}$/i.test(item.color || '') ? item.color : COLORS[index % COLORS.length]};
    });
    return {width,height,nodes,byId:new Map(nodes.map(node => [String(node.id),node]))};
  }

  /** 同一对实体的多条关系分配不同弧度，双向关系也不会完全重合。 */
  function createEdges(relations, layout) {
    const groups = new Map();
    relations.forEach(relation => {
      const from = layout.byId.get(String(relation.from));
      const to = layout.byId.get(String(relation.to));
      if (!from || !to) return;
      const key = [String(from.id), String(to.id)].sort().join('\u0000');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ relation, from, to });
    });
    const edges = [];
    groups.forEach(group => group.forEach((edge, index) => edges.push({ ...edge, ...edgeGeometry(edge, index, group.length) })));
    return edges;
  }

  function edgeGeometry(edge, index, count) {
    const { from, to } = edge;
    if (String(from.id) === String(to.id)) return selfLoopGeometry(from, index);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const direction = String(from.id) < String(to.id) ? 1 : -1;
    const offset = (index - (count - 1) / 2) * 60 * direction + (Math.abs(dy) < 1 ? -78 * Math.sign(dx) : 0);
    const control = { x: (from.x + to.x) / 2 - dy / distance * offset, y: (from.y + to.y) / 2 + dx / distance * offset };
    const start = boundaryPoint(from, control, 30);
    const end = boundaryPoint(to, control, 36);
    return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, labelX: (start.x + 2 * control.x + end.x) / 4, labelY: (start.y + 2 * control.y + end.y) / 4 };
  }

  function boundaryPoint(node, target, radius) {
    const length = Math.hypot(target.x - node.x, target.y - node.y) || 1;
    return { x: node.x + (target.x - node.x) / length * radius, y: node.y + (target.y - node.y) / length * radius };
  }

  function selfLoopGeometry(node, index) {
    const spread = 62 + index * 20;
    return { path: `M ${node.x - 20} ${node.y - 21} C ${node.x - spread} ${node.y - 105 - index * 20}, ${node.x + spread} ${node.y - 105 - index * 20}, ${node.x + 23} ${node.y - 26}`, labelX: node.x, labelY: node.y - 80 - index * 15 };
  }

  function selected(model, kind, id) {
    const selection = model.selectedId;
    if (selection && typeof selection === 'object') return selection.kind === kind && String(selection.id) === String(id);
    return selection != null && (String(selection) === String(id) || String(selection) === `${kind}:${id}`);
  }

  function addArrow(defs, id, color) {
    const marker = svgElement('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
    defs.append(marker);
  }

  function drawEdge(edge, context) {
    const { model, group, instanceId } = context;
    const active = selected(model, 'relation', edge.relation.id);
    const color = active ? '#3f6fff' : '#9aa8bf';
    const node = svgElement('g', { 'data-kind': 'relation', 'data-id': edge.relation.id, tabindex: '0', role: 'button', 'aria-label': `关系：${edge.from.name} ${edge.relation.name || '未命名关系'} ${edge.to.name}`, style: 'cursor:pointer' });
    node.append(svgElement('title', {}, `${edge.from.name} → ${edge.relation.name || '未命名关系'} → ${edge.to.name}`));
    node.append(svgElement('path', { d: edge.path, fill: 'none', stroke: 'transparent', 'stroke-width': 16 }));
    node.append(svgElement('path', { d: edge.path, fill: 'none', stroke: color, 'stroke-width': active ? 2.6 : 1.6, 'marker-end': `url(#${instanceId}-${active ? 'active' : 'arrow'})` }));
    const label = compactName(edge.relation.name || '未命名关系', 9);
    const width = Math.max(36, Array.from(label).length * 12 + 16);
    node.append(svgElement('rect', { x: edge.labelX - width / 2, y: edge.labelY - 11, width, height: 22, rx: 4, fill: active ? '#edf3ff' : '#ffffff', stroke: active ? '#c2d2ff' : '#e9edf4', 'stroke-width': 1 }));
    node.append(svgElement('text', { x: edge.labelX, y: edge.labelY + 4, 'text-anchor': 'middle', fill: active ? '#3f6fff' : '#67748b', 'font-size': 11 }, label));
    group.append(node);
  }

  function drawNode(entity, context) {
    const active = selected(context.model, 'entity', entity.id);
    const node = svgElement('g', { 'data-kind': 'entity', 'data-id': entity.id, tabindex: '0', role: 'button', 'aria-label': `实体：${entity.name || '未命名实体'}`, style: 'cursor:pointer' });
    node.append(svgElement('title', {}, `${entity.name || '未命名实体'} · ${(entity.properties || []).length} 个属性`));
    if (active) node.append(svgElement('circle', { cx: entity.x, cy: entity.y, r: 36, fill: 'none', stroke: entity.color, 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }));
    node.append(svgElement('circle', { cx: entity.x, cy: entity.y, r: 27, fill: entity.color, 'fill-opacity': '.10', stroke: entity.color, 'stroke-width': active ? 2.8 : 1.8 }));
    node.append(svgElement('text', { x: entity.x, y: entity.y + 6, 'text-anchor': 'middle', fill: entity.color, 'font-size': 17, 'font-weight': 600 }, Array.from(entity.name || '实')[0]));
    const label = compactName(entity.name || '未命名实体');
    const width = Array.from(label).length * 13 + 12;
    node.append(svgElement('rect', { x: entity.x - width / 2, y: entity.y + 36, width, height: 22, rx: 3, fill: '#ffffff', 'fill-opacity': '.94' }));
    node.append(svgElement('text', { x: entity.x, y: entity.y + 52, 'text-anchor': 'middle', fill: '#344055', 'font-size': 13, 'font-weight': active ? 600 : 500 }, label));
    node.append(svgElement('text', { x: entity.x, y: entity.y + 70, 'text-anchor': 'middle', fill: '#8a94a7', 'font-size': 11 }, `${(entity.properties || []).length} 个属性`));
    context.group.append(node);
  }

  /** 虚线箭头由子类型指向父类型，点击后定位子类型而非业务关系编辑。 */
  function drawInheritance(entity,context,layout) {
    const parent = layout.byId.get(String(entity.parentId));
    if (!parent) return;
    const start = boundaryPoint(entity,parent,30), end = boundaryPoint(parent,entity,35);
    const x = start.x * .72 + end.x * .28, y = start.y * .72 + end.y * .28;
    const edge = svgElement('g',{'data-kind':'entity','data-id':entity.id,'data-inheritance':entity.id,tabindex:'0',role:'button','aria-label':entity.name + ' 继承自 ' + parent.name,style:'cursor:pointer'});
    edge.append(svgElement('title',{},entity.name + ' 继承自 ' + parent.name));
    edge.append(svgElement('path',{d:`M ${start.x} ${start.y} L ${end.x} ${end.y}`,stroke:'transparent','stroke-width':14}));
    edge.append(svgElement('path',{d:`M ${start.x} ${start.y} L ${end.x} ${end.y}`,stroke:'#a3afc1','stroke-width':1.5,'stroke-dasharray':'5 4',fill:'none','marker-end':`url(#${context.instanceId}-inheritance)`}));
    edge.append(svgElement('rect',{x:x - 17,y:y - 9,width:34,height:18,rx:3,fill:'#fbfcfe'}));
    edge.append(svgElement('text',{x,y:y + 4,'text-anchor':'middle',fill:'#8592a7','font-size':10},'继承'));
    context.group.append(edge);
  }

  function showEmpty(state) {
    const empty = document.createElement('div');
    empty.className = 'graph-preview-empty';
    empty.style.cssText = 'height:100%;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:var(--muted,#7c8597);font-size:13px;text-align:center;padding:24px;box-sizing:border-box';
    const text = document.createElement('p');
    text.textContent = '添加实体后，图谱预览将在这里呈现';
    text.style.margin = '0';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = '添加实体';
    button.addEventListener('click', () => state.options.onEmptyAction?.());
    empty.append(text, button);
    state.root.replaceChildren(empty);
  }

  function buildCanvas(state) {
    const layout = createLayout(state.model.entities);
    state.layout = layout;
    const svg = svgElement('svg', { width: '100%', height: '100%', viewBox: `0 0 ${layout.width} ${layout.height}`, role: 'group', 'aria-label': '图谱本体预览，可点击实体或关系进行编辑', style: 'display:block;min-height:300px;touch-action:none;user-select:none;cursor:grab;font-family:inherit;overflow:hidden' });
    const defs = svgElement('defs');
    addArrow(defs, `${state.instanceId}-arrow`, '#9aa8bf');
    addArrow(defs, `${state.instanceId}-active`, '#3f6fff');
    const inheritanceMarker = svgElement('marker',{id:`${state.instanceId}-inheritance`,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:8,markerHeight:8,orient:'auto-start-reverse'});
    inheritanceMarker.append(svgElement('path',{d:'M 0 0 L 9 5 L 0 10 z',fill:'#fbfcfe',stroke:'#a3afc1','stroke-width':1}));
    defs.append(inheritanceMarker);
    const group = svgElement('g');
    const context = { model: state.model, group, instanceId: state.instanceId };
    layout.nodes.filter(entity => entity.parentId).forEach(entity => drawInheritance(entity,context,layout));
    createEdges(state.model.relations, layout).forEach(edge => drawEdge(edge, context));
    layout.nodes.forEach(entity => drawNode(entity, context));
    svg.append(defs, group);
    state.svg = svg;
    state.group = group;
    state.root.replaceChildren(svg);
    applyTransform(state);
  }

  function applyTransform(state) {
    if (!state.group || !state.layout) return;
    const { width, height } = state.layout;
    const x = width / 2 * (1 - state.scale) + state.pan.x;
    const y = height / 2 * (1 - state.scale) + state.pan.y;
    state.group.setAttribute('transform', `translate(${x},${y}) scale(${state.scale})`);
    state.root.dispatchEvent(new CustomEvent('graphpreviewzoom', { bubbles: true, detail: { scale: state.scale } }));
  }

  function changeZoom(state, factor) {
    state.scale = Math.max(.4, Math.min(3.5, state.scale * factor));
    applyTransform(state);
  }

  function beginPan(state, event) {
    if (!state.svg || event.button !== 0 || event.target.closest('[data-kind]')) return;
    state.drag = { x: event.clientX, y: event.clientY, panX: state.pan.x, panY: state.pan.y };
    state.root.setPointerCapture(event.pointerId);
    state.svg.style.cursor = 'grabbing';
  }

  function movePan(state, event) {
    if (!state.drag || !state.svg) return;
    const rect = state.svg.getBoundingClientRect();
    const ratio = Math.max(state.layout.width / rect.width, state.layout.height / rect.height);
    state.pan.x = state.drag.panX + (event.clientX - state.drag.x) * ratio;
    state.pan.y = state.drag.panY + (event.clientY - state.drag.y) * ratio;
    applyTransform(state);
  }

  function endPan(state, event) {
    state.drag = null;
    if (state.svg) state.svg.style.cursor = 'grab';
    if (state.root.hasPointerCapture(event.pointerId)) state.root.releasePointerCapture(event.pointerId);
  }

  /** 固定容器接收交互，重绘后不会累积节点监听器。 */
  function bindInteractions(state) {
    const eventOptions = { signal: state.controller.signal };
    state.root.addEventListener('pointerdown', event => beginPan(state, event), eventOptions);
    state.root.addEventListener('pointermove', event => movePan(state, event), eventOptions);
    state.root.addEventListener('pointerup', event => endPan(state, event), eventOptions);
    state.root.addEventListener('pointercancel', event => endPan(state, event), eventOptions);
    state.root.addEventListener('click', event => selectTarget(state, event), eventOptions);
    state.root.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('[data-kind]')) { event.preventDefault(); selectTarget(state, event); }
    }, eventOptions);
    state.root.addEventListener('wheel', event => {
      if (!state.svg || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      changeZoom(state, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { ...eventOptions, passive: false });
  }

  function selectTarget(state, event) {
    const target = event.target.closest('[data-kind]');
    if (!target || !state.root.contains(target)) return;
    const collection = target.dataset.kind === 'entity' ? state.model.entities : state.model.relations;
    const item = collection.find(entry => String(entry.id) === target.dataset.id);
    if (item) state.options.onSelect?.({ kind: target.dataset.kind, id: item.id });
  }

  /**
   * 创建本体图预览。container 为独立容器，无效时抛出 TypeError。
   * onSelect 接收 {kind:'entity'|'relation',id}；onEmptyAction 响应空态添加。
   * render 接收 {entities,relations,selectedId}，另外提供缩放、复位及销毁方法。
   * 未完成的关系、已删除的端点被忽略，保障编辑过程可持续预览。
   */
  function create(container, options = {}) {
    if (!(container instanceof HTMLElement)) throw new TypeError('图谱预览需要有效容器');
    const root = document.createElement('div');
    root.className = 'graph-preview-surface';
    root.style.cssText = 'width:100%;height:100%;min-height:300px;overflow:hidden;position:relative';
    container.replaceChildren(root);
    const state = { root, options, instanceId: `ontology-preview-${++instanceCount}`, controller: new AbortController(), scale: 1, pan: { x: 0, y: 0 }, model: { entities: [], relations: [] }, svg: null, group: null, drag: null, destroyed: false };
    bindInteractions(state);
    showEmpty(state);
    return {
      render(model = {}) {
        if (state.destroyed) return;
        state.model = { entities: model.entities || [], relations: model.relations || [], selectedId: model.selectedId };
        state.svg = null;
        state.group = null;
        if (!state.model.entities.length) { showEmpty(state); return; }
        buildCanvas(state);
      },
      zoomIn() { if (!state.destroyed) changeZoom(state, 1.2); },
      zoomOut() { if (!state.destroyed) changeZoom(state, 1 / 1.2); },
      reset() { state.scale = 1; state.pan = { x: 0, y: 0 }; if (!state.destroyed) applyTransform(state); },
      destroy() { state.destroyed = true; state.controller.abort(); state.root.remove(); }
    };
  }

  window.KnowledgeGraphPreview = Object.freeze({ create });
})();
