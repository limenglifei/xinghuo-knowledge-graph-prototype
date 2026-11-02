/* 编辑区只维护未保存草稿；列表和审核流程由 ontology-app.js 协调。 */
(() => {
  const K = window.KG, $ = K.$, esc = K.escape, H = K.hierarchy;
  const collapsed = new Set();
  let graph, activeTab = 'entities', propertyOwner, propertyOntologyId, properties = [], originalProperties = '';
  const button = (label,action,extra = '') => `<button class="link-btn ${extra}" type="button" data-type-action="${action}">${label}</button>`;
  /** 子类型递归留在所属根类型容器内；收起仅改变展示，不改变本体结构。 */
  function entityMarkup(item,indexes,visited) {
    if (visited.has(item.id)) return '';
    visited.add(item.id);
    const depth = H.depth(K.draft,item.id), children = H.children(K.draft,item.id);
    const isCollapsed = collapsed.has(item.id), childrenId = 'entity-children-' + item.id;
    const inheritedCount = H.inherited(K.draft,item.id).length, total = item.properties.length + inheritedCount;
    const hint = total ? `本级 ${item.properties.length} · 继承 ${inheritedCount}` : '暂未配置属性';
    const toggle = children.length ? `<button class="type-tree-toggle" type="button" data-type-action="collapse" aria-label="${isCollapsed ? '展开' : '收起'} ${esc(item.name || '未命名类型')}" aria-expanded="${!isCollapsed}" aria-controls="${childrenId}">${isCollapsed ? '▸' : '▾'}</button>` : '<span class="type-tree-leaf" aria-hidden="true">·</span>';
    const descendants = children.length ? `<div class="entity-tree-children" id="${childrenId}" ${isCollapsed ? 'hidden' : ''}>${children.map(child => entityMarkup(child,indexes,visited)).join('')}</div>` : '';
    return `<div class="entity-tree-node" data-entity="${item.id}" data-depth="${depth}"><div class="entity-node-content"><div class="type-top">${toggle}<input data-field="name" maxlength="50" aria-label="实体类型 ${indexes.get(item.id) + 1} 名称" placeholder="实体名称，例如：药品" value="${esc(item.name)}"><span class="type-level">${depth} 级</span><button class="link-btn remove-type" type="button" data-type-action="remove" aria-label="删除 ${esc(item.name || '未命名实体类型')}">×</button></div><div class="type-bottom"><span class="type-hint">${hint}</span><div class="type-actions">${button('属性(' + total + ')','properties')}<button class="link-btn" type="button" data-type-action="addChild" ${depth >= 5 ? 'disabled title="已到第 5 级，不能继续添加子类型"' : ''}>＋ 子类型</button></div></div>${children.length && isCollapsed ? `<div class="type-collapsed-hint">已收起 ${H.descendants(K.draft,item.id).length} 个子类型</div>` : ''}</div>${descendants}</div>`;
  }
  function entityTreesMarkup() {
    const visited = new Set(), indexes = new Map(K.draft.entities.map((item,index) => [item.id,index]));
    const roots = K.draft.entities.filter(item => !item.parentId || !indexes.has(item.parentId));
    // 非法导入结构也保留可见节点，由保存校验反馈，不在展示时静默丢弃。
    return [...roots,...K.draft.entities].map(item => visited.has(item.id) ? '' :
      `<article class="type-card hierarchy-card" data-tree-root="${item.id}" aria-label="${esc(item.name || '未命名类型')} 类型树">${entityMarkup(item,indexes,visited)}</article>`).join('');
  }
  function entityOptions(selected) {
    return '<option value="">请选择实体</option>' + K.draft.entities.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${esc(H.path(K.draft,item.id))}</option>`).join('');
  }
  function relationMarkup(item,index) {
    return `<article class="type-card" data-relation="${item.id}"><div class="type-top"><span class="type-number">${String(index + 1).padStart(2,'0')}</span><input data-field="name" maxlength="50" aria-label="关系 ${index + 1} 名称" placeholder="关系名称，例如：适用于" value="${esc(item.name)}"><button class="link-btn remove-type" type="button" data-type-action="remove" aria-label="删除关系 ${index + 1}">×</button></div><div class="relation-endpoints"><label>起点实体<select data-field="from" aria-label="关系 ${index + 1} 起点实体">${entityOptions(item.from)}</select></label><span class="arrow">→</span><label>终点实体<select data-field="to" aria-label="关系 ${index + 1} 终点实体">${entityOptions(item.to)}</select></label></div><div class="type-bottom"><span class="type-hint">定义从起点到终点的关联</span>${button('属性(' + item.properties.length + ')','properties')}</div></article>`;
  }
  function renderConfig() {
    $('entityRows').innerHTML = entityTreesMarkup();
    renderRelations(); $('entitiesEmpty').hidden = K.draft.entities.length > 0;
    $('entityCount').textContent = K.draft.entities.length;
    $('addRelation').disabled = K.draft.entities.length === 0;
    $('addRelation').title = K.draft.entities.length ? '' : '请先添加实体类型';
    paintSelection();
  }
  function renderRelations() {
    $('relationRows').innerHTML = K.draft.relations.map(relationMarkup).join('');
    $('relationsEmpty').hidden = K.draft.relations.length > 0;
    $('relationCount').textContent = K.draft.relations.length;
  }
  function switchTab(tab) {
    activeTab = tab;
    $('entitiesPanel').hidden = tab !== 'entities'; $('relationsPanel').hidden = tab !== 'relations';
    document.querySelectorAll('[data-config-tab]').forEach(element => {
      element.classList.toggle('active',element.dataset.configTab === tab);
      element.setAttribute('aria-pressed',element.dataset.configTab === tab);
    });
  }
  function paintSelection() {
    document.querySelectorAll('[data-entity],[data-relation]').forEach(row => row.classList.toggle('selected',(row.dataset.entity || row.dataset.relation) === K.selected?.id && K.previewMode === 'draft'));
  }
  function previewData() {
    return K.previewMode === 'live' && K.item().live ? K.item().live.config : K.draft;
  }
  function renderPreview() {
    const data = previewData();
    const entities = data.entities.map(item => ({...item,properties:H.effective(data,item.id)}));
    graph.render({entities,relations:data.relations,selectedId:K.selected});
    const hierarchyCount = data.entities.filter(item => item.parentId).length;
    $('previewSummary').textContent = `${data.entities.length} 个实体类型 · ${data.relations.length} 个关系${hierarchyCount ? ' · ' + hierarchyCount + ' 组继承' : ''}`;
    $('graphLegend').innerHTML = data.entities.map(item => `<span class="legend-item"><span class="legend-dot" style="background:${item.color}"></span>${esc(item.name || '未命名实体')}</span>`).join('') + (hierarchyCount ? '<span class="legend-item"><i class="legend-inheritance"></i>继承</span><span class="legend-item"><i class="legend-relation"></i>业务关系</span>' : '');
    document.querySelectorAll('[data-preview]').forEach(element => element.classList.toggle('active',element.dataset.preview === K.previewMode));
    $('livePreviewButton').hidden = !K.item().live;
    $('livePreviewButton').textContent = '已发布 v' + (K.item().live?.version || 1);
    renderSelection(data); paintSelection();
  }
  function renderSelection(data) {
    const key = K.selected?.kind === 'relation' ? 'relations' : 'entities';
    const item = data[key].find(value => value.id === K.selected?.id);
    if (!item) {
      $('selectionDetail').innerHTML = `<strong>${K.previewMode === 'live' ? '已发布版本' : '预览说明'}</strong><p>${K.previewMode === 'live' ? '当前展示已通过审核的版本，不受左侧草稿修改影响。' : '左侧修改会实时呈现在图谱中。这里展示本体结构，不包含实际业务数据。'}</p>`;
      return;
    }
    const from = data.entities.find(value => value.id === item.from)?.name;
    const to = data.entities.find(value => value.id === item.to)?.name;
    const values = key === 'relations' ? item.properties : H.effective(data,item.id);
    const detail = key === 'relations' ? `${from || '未选择起点'} → ${item.name || '未命名关系'} → ${to || '未选择终点'}` : `${H.path(data,item.id)} · 第 ${H.depth(data,item.id)} 级 · ${values.length} 个属性`;
    const descriptions = values.filter(value => value.description).map(value => `<div><dt>${esc(value.name)}${value.fromId ? '（继承）' : ''}</dt><dd>${esc(value.description)}</dd></div>`).join('');
    $('selectionDetail').innerHTML = `<strong>${esc(item.name || '未命名类型')}</strong><p>${esc(detail)}</p><div class="property-chips">${values.map(value => `<span class="entity-tag ${value.fromId ? 'inherited-chip' : ''}" title="${esc([value.fromId ? '继承自 ' + value.fromName : value.name,value.description].filter(Boolean).join('：'))}">${esc(value.name)} · ${esc(value.type)}${value.required ? ' · 必填' : ''}${value.fromId ? ' · 继承' : ''}</span>`).join('')}</div>${descriptions ? `<dl class="property-notes" aria-label="属性说明与示例">${descriptions}</dl>` : ''}`;
  }
  function selectItem(selection) {
    K.selected = selection; renderPreview();
    if (K.previewMode !== 'draft') return;
    switchTab(selection.kind === 'relation' ? 'relations' : 'entities');
    if (selection.kind === 'entity') {
      revealEntity(selection.id); renderConfig();
    }
    const selector = selection.kind === 'relation' ? '[data-relation="' + selection.id + '"]' : '[data-entity="' + selection.id + '"]';
    document.querySelector(selector)?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function revealEntity(id) {
    let item = K.draft.entities.find(value => value.id === id);
    const visited = new Set([id]);
    while (item?.parentId && !visited.has(item.parentId)) {
      collapsed.delete(item.parentId); visited.add(item.parentId);
      item = K.draft.entities.find(value => value.id === item.parentId);
    }
  }
  function changed() {
    $('structureError').hidden = true; renderPreview(); K.refresh();
  }
  function ownerFor(row) {
    const key = row.dataset.entity ? 'entities' : 'relations';
    return {key,item:K.draft[key].find(item => item.id === (row.dataset.entity || row.dataset.relation))};
  }
  function updateType(event) {
    const row = event.target.closest('[data-entity],[data-relation]');
    if (!row || !event.target.dataset.field || K.locked()) return;
    ownerFor(row).item[event.target.dataset.field] = event.target.value;
    if (row.dataset.entity && event.type === 'change') renderRelations();
    changed();
  }
  function removeType(key,item) {
    if (key === 'entities' && H.children(K.draft,item.id).length) {
      K.notify('该类型包含子类型，请先逐项删除子类型，再删除该类型。');
      $('structureError').textContent = '“' + (item.name || '未命名类型') + '”包含子类型，不能直接删除。请先逐项删除其子类型。';
      $('structureError').hidden = false; return;
    }
    const linked = key === 'entities' ? K.draft.relations.filter(value => value.from === item.id || value.to === item.id) : [];
    const impact = linked.length ? '同时移除关系：' + linked.map(value => value.name || '未命名关系').join('、') + '。' : '';
    K.confirm({title:'删除' + (key === 'entities' ? '实体' : '关系') + '？',text:'将从当前草稿中删除“' + (item.name || '未命名类型') + '”及其属性。' + impact + '保存后生效。',label:'删除',danger:true,action:() => {
      K.draft[key] = K.draft[key].filter(value => value.id !== item.id);
      K.draft.relations = K.draft.relations.filter(value => !linked.includes(value));
      K.selected = null; renderConfig(); changed();
    }});
  }
  function typeAction(event) {
    const action = event.target.closest('[data-type-action]');
    if (!action || K.locked()) return;
    const {key,item} = ownerFor(action.closest('[data-entity],[data-relation]'));
    if (action.dataset.typeAction === 'collapse') {
      collapsed.has(item.id) ? collapsed.delete(item.id) : collapsed.add(item.id);
      renderConfig();
      document.querySelector('[data-entity="' + item.id + '"] [data-type-action=collapse]')?.focus({preventScroll:true});
      return;
    }
    K.selected = {kind:key === 'entities' ? 'entity' : 'relation',id:item.id};
    if (action.dataset.typeAction === 'addChild') { addEntity(item.id); return; }
    if (action.dataset.typeAction === 'remove') removeType(key,item); else openProperties(item);
  }
  function addEntity(parentId = '') {
    if (K.locked()) return;
    if (parentId && H.depth(K.draft,parentId) >= 5) { K.notify('实体类型最多支持 5 级。'); return; }
    switchTab('entities'); const item = K.entity('',K.draft.entities.length); K.draft.entities.push(item);
    item.parentId = parentId; revealEntity(item.id);
    K.selected = {kind:'entity',id:item.id}; renderConfig(); changed();
    const input = document.querySelector('[data-entity="' + item.id + '"] input[data-field=name]');
    input.scrollIntoView({block:'nearest'}); input.focus({preventScroll:true});
  }
  function addRelation() {
    if (K.locked() || !K.draft.entities.length) return;
    const item = {id:K.uid('relation'),name:'',from:'',to:'',properties:[]};
    K.draft.relations.push(item); K.selected = {kind:'relation',id:item.id}; renderConfig(); changed();
    $('relationRows').lastElementChild.querySelector('input').focus();
  }
  function openProperties(owner) {
    propertyOwner = owner; propertyOntologyId = K.currentId; properties = K.clone(owner.properties); originalProperties = JSON.stringify(properties);
    $('propertyTitle').textContent = '属性设置 · ' + (owner.name || '未命名类型');
    $('propertyError').hidden = true; renderProperties(); $('propertyDialog').showModal();
  }
  function renderProperties() {
    renderInheritedProperties();
    $('propertyEmpty').hidden = properties.length > 0;
    $('propertyRows').innerHTML = properties.map((item,index) => `<div class="property-row" data-property="${item.id}"><input data-property-field="name" maxlength="50" aria-label="属性 ${index + 1} 名称" placeholder="例如：名称" value="${esc(item.name)}"><select data-property-field="type" aria-label="属性 ${index + 1} 类型">${['文本','数字','日期','是/否'].map(type => `<option ${item.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select><label class="check-cell"><input type="checkbox" data-property-field="required" aria-label="属性 ${index + 1} 必填" ${item.required ? 'checked' : ''}></label><label class="property-description-field"><span>说明与示例（选填）</span><textarea data-property-field="description" rows="2" maxlength="500" aria-label="属性 ${index + 1} 说明与示例（选填）" aria-describedby="propertyDescriptionHelp" placeholder="例如：记录任职的开始日期，如 2026-01-01">${esc(item.description)}</textarea></label><button class="link-btn danger" type="button" data-remove-property>删除</button></div>`).join('');
  }
  function renderInheritedProperties() {
    const isEntity = K.draft.entities.some(item => item.id === propertyOwner.id);
    const values = isEntity ? H.inherited(K.draft,propertyOwner.id) : [];
    $('inheritedProperties').hidden = !values.length;
    $('inheritedProperties').innerHTML = values.length ? '<h3>继承属性 <span>只读，请在来源类型中修改</span></h3>' + values.map(item => `<div class="inherited-property-row"><strong>${esc(item.name)}</strong><span>${esc(item.type)}${item.required ? ' · 必填' : ''}</span><small>继承自 ${esc(item.fromName)}</small><p class="inherited-property-description">说明与示例：${esc(item.description || '未填写')}</p></div>`).join('') : '';
    $('ownPropertyHeading').textContent = isEntity ? '本级属性' : '关系属性';
  }
  function updateProperty(event) {
    const field = event.target.dataset.propertyField;
    if (!field) return;
    const id = event.target.closest('[data-property]').dataset.property;
    properties.find(item => item.id === id)[field] = field === 'required' ? event.target.checked : event.target.value;
    $('propertyError').hidden = true;
  }
  function saveProperties(event) {
    event.preventDefault(); const names = new Set();
    const ownerExists = K.draft && [...K.draft.entities,...K.draft.relations].includes(propertyOwner);
    if (!ownerExists || propertyOntologyId !== K.currentId || K.locked()) {
      $('propertyDialog').close(); K.notify('当前属性不可修改，请重新打开属性设置。'); return;
    }
    for (const item of properties) {
      item.name = item.name.trim(); const key = item.name.toLowerCase();
      if (!key || names.has(key)) {
        $('propertyError').textContent = !key ? '请填写属性名称。' : '同一类型的属性名称不能重复。'; $('propertyError').hidden = false;
        document.querySelector('[data-property="' + item.id + '"] input').focus(); return;
      }
      names.add(key);
    }
    // 父属性的增改也可能与后代重名，确认前检查整个草稿，不覆盖后代属性。
    const proposed = K.clone(K.draft);
    const proposedOwner = [...proposed.entities,...proposed.relations].find(item => item.id === propertyOwner.id);
    proposedOwner.properties = K.clone(properties);
    const error = H.validate(proposed);
    if (error) { $('propertyError').textContent = error.message; $('propertyError').hidden = false; return; }
    propertyOwner.properties = K.clone(properties); $('propertyDialog').close(); renderConfig(); changed();
  }
  function closeProperties() {
    if (originalProperties === JSON.stringify(properties)) { $('propertyDialog').close(); return; }
    K.confirm({title:'放弃属性修改？',text:'尚未确认的属性修改将不会加入草稿。',label:'放弃修改',danger:true,action:() => $('propertyDialog').close()});
  }
  function focusError(error) {
    if (error.tab === 'entities' && error.id) { revealEntity(error.id); renderConfig(); }
    switchTab(error.tab); $('structureError').textContent = error.message; $('structureError').hidden = false;
    const card = error.id ? document.querySelector('[data-' + (error.tab === 'entities' ? 'entity' : 'relation') + '="' + error.id + '"]') : null;
    if (card) { card.scrollIntoView({block:'nearest'}); card.querySelector('input')?.focus(); }
    else $('structureError').scrollIntoView({block:'nearest'});
  }
  function open() {
    collapsed.clear(); switchTab('entities'); $('structureError').hidden = true; renderConfig(); renderPreview();
  }
  function init() {
    const inheritedSection = document.createElement('section');
    inheritedSection.id = 'inheritedProperties'; inheritedSection.className = 'inherited-properties'; inheritedSection.hidden = true;
    const ownHeading = document.createElement('h3');
    ownHeading.id = 'ownPropertyHeading'; ownHeading.className = 'own-property-heading';
    $('propertyDialog').querySelector('.row-head').before(inheritedSection,ownHeading);
    $('entitiesPanel').querySelector('.module-head p').textContent = '根类型为第 1 级，最多 5 级；子类型继承父级属性';
    $('addEntity').textContent = '＋ 顶层类型';
    graph = window.KnowledgeGraphPreview.create($('graphCanvas'),{onSelect:selectItem,onEmptyAction:addEntity});
    $('zoomIn').addEventListener('click',() => graph.zoomIn()); $('zoomOut').addEventListener('click',() => graph.zoomOut()); $('resetGraph').addEventListener('click',() => graph.reset());
    document.querySelectorAll('[data-config-tab]').forEach(element => element.addEventListener('click',() => switchTab(element.dataset.configTab)));
    document.querySelectorAll('[data-preview]').forEach(element => element.addEventListener('click',() => { K.previewMode = element.dataset.preview; K.selected = null; renderPreview(); }));
    ['entityRows','relationRows'].forEach(id => { $(id).addEventListener('input',updateType); $(id).addEventListener('change',updateType); $(id).addEventListener('click',typeAction); });
    $('addEntity').addEventListener('click',() => addEntity()); $('addRelation').addEventListener('click',addRelation);
    $('propertyForm').addEventListener('submit',saveProperties);
    ['closeProperties','cancelProperties'].forEach(id => $(id).addEventListener('click',closeProperties));
    $('propertyDialog').addEventListener('cancel',event => { event.preventDefault(); closeProperties(); });
    $('addProperty').addEventListener('click',() => { properties.push(K.property()); renderProperties(); $('propertyRows').lastElementChild.querySelector('input').focus(); });
    $('propertyRows').addEventListener('input',updateProperty); $('propertyRows').addEventListener('change',updateProperty);
    $('propertyRows').addEventListener('click',event => {
      const target = event.target.closest('[data-remove-property]'); if (!target) return;
      properties = properties.filter(item => item.id !== target.closest('[data-property]').dataset.property); renderProperties();
    });
  }
  const hasPropertyChanges = () => $('propertyDialog').open && originalProperties !== JSON.stringify(properties);
  K.editor = {init,open,renderConfig,renderPreview,focusError,changed,hasPropertyChanges};
})();
