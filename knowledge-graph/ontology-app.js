/* 列表、二级编辑路由与基本信息协调；不使用持久化，刷新恢复演示数据。 */
(() => {
  const K = window.KG, $ = K.$, esc = K.escape;
  let confirmAction, leaveAction, basicMode = 'create', originalBasic = '', basicOwnerId = null;
  const moduleDescriptions = {
    modeling:'定义实体、关系与属性，统一知识表达，为抽取、融合和应用建立清晰的结构。',
    extraction:'从文档中提取实体、关系与属性，将分散的信息转化为可追溯、可审核的图谱知识。',
    fusion:'识别重复与歧义，核对冲突并整合多源信息，让知识更一致、更可信。',
    quality:'检查图谱完整性、一致性与关联质量，定位待核对问题；质量达标后提交发布审核，让可信知识正式可用。',
    terms:'统一管理标准术语、别名与释义，为知识融合提供参考。'
  };
  K.pageTab = 'modeling';
  K.pageGraphId = null;
  const statusMarkup = item => `<span class="status ${K.status(item)}">${K.labels[K.status(item)]}</span>`;
  function availability(item) {
    if (!item.live) return item.stage === 'reviewing' ? '审核通过后可用' : '尚未发布，不可用于图谱构建';
    if (!item.live.enabled) return '已发布 v' + item.live.version + ' 已禁用';
    return '已发布 v' + item.live.version + (item.stage === 'published' ? ' · 当前可用' : ' 仍可用，当前草稿尚未生效');
  }
  function cardMarkup(item) {
    const tags = item.entities.slice(0,3).map(value => `<span class="entity-tag" title="${esc(value.name)}">${esc(value.name || '未命名实体')}</span>`).join('');
    const toggle = item.live && item.stage !== 'reviewing' ? `<button class="link-btn" data-action="toggle">${item.live.enabled ? '禁用' : '启用'}</button>` : '';
    return `<article class="ontology-card" data-id="${item.id}" role="link" tabindex="0" aria-label="查看 ${esc(item.name)} 的本体详情"><div class="card-main"><div class="card-heading"><span class="ontology-symbol"><svg class="icon"><use href="#graph-icon"/></svg></span><h2 class="card-title" title="${esc(item.name)}">${esc(item.name)}</h2>${statusMarkup(item)}</div><p class="card-desc" title="${esc(item.description || '暂无描述')}">${esc(item.description || '暂无描述')}</p><div class="card-stats"><span><strong>${item.entities.length}</strong>实体类型</span><span><strong>${item.relations.length}</strong>关系类型</span></div><div class="entity-tags">${tags}${item.entities.length > 3 ? '<span class="entity-tag">+' + (item.entities.length - 3) + '</span>' : ''}</div><div class="created">更新于 ${item.updated}</div><div class="card-availability ${item.live?.enabled ? 'available' : ''}">${esc(availability(item))}</div></div><footer class="card-footer"><button class="link-btn" data-action="edit">${item.stage === 'reviewing' ? '查看' : '编辑'}</button>${toggle}<button class="link-btn danger" data-action="delete">删除</button></footer></article>`;
  }
  function emptyMarkup() {
    const filtered = K.filter !== 'all' || K.keyword;
    return `<div class="empty"><h2>${filtered ? '没有找到符合条件的本体' : '还没有本体'}</h2><p>${filtered ? '试试其他关键词，或清除筛选条件。' : '创建一个草稿，开始定义知识图谱的结构。'}</p><button class="btn" data-empty="${filtered ? 'reset' : 'create'}">${filtered ? '清除筛选' : '新增本体'}</button></div>`;
  }
  function renderList() {
    const filters = [['all','全部本体'],...Object.entries(K.labels)];
    $('ontologyStatus').innerHTML = filters.map(([key,label]) => {
      const total = key === 'all' ? K.items.length : K.items.filter(item => K.status(item) === key).length;
      return `<option value="${key}" ${K.filter === key ? 'selected' : ''}>${key === 'all' ? '全部状态' : label}（${total}）</option>`;
    }).join('');
    const items = K.items.filter(item => (K.filter === 'all' || K.status(item) === K.filter) && (item.name + ' ' + item.description).toLowerCase().includes(K.keyword));
    $('resultCount').textContent = '共 ' + items.length + ' 个本体';
    $('ontologyCards').innerHTML = items.length ? items.map(cardMarkup).join('') : emptyMarkup();
  }
  function resetFilters() {
    K.filter = 'all'; K.keyword = ''; $('ontologySearch').value = ''; renderList();
  }
  function workflowNotice(item) {
    if (item.stage === 'reviewing') return {kind:'warning',text:'发布申请审核中，当前配置暂不可修改。需要调整时可撤回申请。' + (item.live?.enabled ? '已发布 v' + item.live.version + ' 仍可用。' : '审核通过前不可使用本次申请内容。')};
    if (item.stage === 'rejected') return {kind:'error',text:'审核未通过：' + (item.history.find(record => record.status === 'rejected')?.remark || '请查看审核历史。') + ' 修改后请保存草稿并重新提交。'};
    if (item.live) return {kind:item.live.enabled ? '' : 'warning',text:'当前发布版本 v' + item.live.version + (item.live.enabled ? ' 正在使用。' : ' 已禁用。') + '左侧修改仅影响工作草稿，重新审核通过后才会更新发布版本。'};
    return {kind:'',text:'草稿构建：完善实体与关系 → 保存草稿 → 提交发布审核 → 审核通过后可用。'};
  }
  function renderChrome() {
    if (!K.currentId || !K.item()) return;
    const item = K.item(), locked = K.locked(), dirty = K.dirty();
    $('builderName').textContent = K.draft.name;
    $('builderStatus').textContent = K.labels[K.status(item)]; $('builderStatus').className = 'status ' + K.status(item);
    $('saveIndicator').textContent = locked ? '等待审核' : dirty ? '有未保存修改' : '草稿已保存';
    $('saveIndicator').classList.toggle('dirty',dirty);
    $('summaryName').textContent = K.draft.name; $('summaryDescription').textContent = K.draft.description || '暂无描述';
    const notice = workflowNotice(item); $('workflowNotice').textContent = notice.text; $('workflowNotice').className = 'workflow-notice ' + notice.kind;
    $('structureFields').disabled = locked; $('editBasic').disabled = locked; $('openAI').disabled = locked;
    $('saveDraft').disabled = locked; $('withdrawReview').hidden = !locked;
    $('submitReview').hidden = locked;
    $('submitReview').disabled = dirty || item.stage === 'published';
    $('submitReview').textContent = item.live ? '提交变更审核' : '提交发布审核';
    $('submitReview').title = dirty ? '请先保存草稿' : item.stage === 'published' ? '修改并保存草稿后可提交变更审核' : '';
    $('saveFirstHint').hidden = !dirty; $('availabilityText').textContent = availability(item);
  }
  function renderModule() {
    const terms = K.pageTab === 'terms';
    $('graphPage').hidden = terms; $('terminologyPage').hidden = !terms;
    document.querySelector('.topbar > span').textContent = terms ? '知识应用 / 术语库' : '知识应用 / 知识图谱';
    document.querySelector('.sidebar-note').textContent = (terms ? '术语库' : '知识图谱') + ' · 产品原型';
    ['graphMenu','termsMenu'].forEach(id => {
      const active = id === 'termsMenu' ? terms : !terms;
      $(id).classList.toggle('active',active);
      if (active) $(id).setAttribute('aria-current','page'); else $(id).removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-module-tab]').forEach(button => {
      const active = button.dataset.moduleTab === K.pageTab;
      button.classList.toggle('active',active); button.setAttribute('aria-pressed',active);
    });
    document.querySelectorAll('[data-module-panel]').forEach(panel => { panel.hidden = panel.dataset.modulePanel !== K.pageTab; });
    $('pageDescription').textContent = moduleDescriptions[K.pageTab];
    $('createOntology').hidden = K.pageTab !== 'modeling'; $('createExtraction').hidden = K.pageTab !== 'extraction';
  }
  function renderModules() { K.extractionUI.render(); K.resultsUI.render(); K.fusionUI.render(); K.qualityUI.render(); K.terminologyUI.render(); K.fusionTasks.render(); K.graphCatalog.render(); K.applicationUI.render(); }
  K.refresh = () => { renderList(); renderChrome(); renderModule(); renderModules(); };
  K.notify = message => {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(K.notify.timer); K.notify.timer = setTimeout(() => { $('toast').hidden = true; },2600);
  };
  K.confirm = options => {
    $('confirmTitle').textContent = options.title; $('confirmText').textContent = options.text;
    $('acceptConfirm').textContent = options.label || '确定'; $('acceptConfirm').className = 'btn ' + (options.danger ? 'danger-fill' : 'primary');
    confirmAction = options.action; $('confirmDialog').showModal(); $('cancelConfirm').focus();
  };
  function moduleHash(tab,graphId) { return tab === 'modeling' ? '' : '#tab=' + tab + (graphId ? '&graph=' + encodeURIComponent(graphId) : ''); }
  function currentHash() { return K.currentId ? '#edit=' + encodeURIComponent(K.currentId) : moduleHash(K.pageTab,K.pageGraphId); }
  function replaceHash(hash) { history.replaceState(null,'',location.pathname + location.search + hash); }
  function route(id,replace = false,tab = K.pageTab,graphId = K.pageGraphId) {
    if (tab === 'application' || tab === 'visualization') tab = 'quality';
    const item = K.items.find(value => value.id === id);
    const previousGraph = K.pageTab + ':' + K.pageGraphId;
    if (id && !item) K.notify('该草稿不在当前演示中，刷新会恢复初始示例。');
    if (!item) {
      K.pageTab = Object.hasOwn(moduleDescriptions,tab) ? tab : 'modeling';
      K.pageGraphId = ['extraction','fusion','quality'].includes(K.pageTab) ? graphId : null;
      if (K.pageGraphId && !K.graphCatalog.find(K.pageGraphId)) { K.pageGraphId = null; K.notify('该图谱已不存在，请从列表重新选择。'); }
    }
    const hash = item ? '#edit=' + encodeURIComponent(id) : moduleHash(K.pageTab,K.pageGraphId);
    if (replace) replaceHash(hash); else if (location.hash !== hash) history.pushState(null,'',location.pathname + location.search + hash);
    $('listView').hidden = Boolean(item); $('editorView').hidden = !item;
    document.body.classList.toggle('editor-open',Boolean(item));
    if (item) { K.loadDraft(item); K.editor.open(); renderChrome(); }
    else { K.currentId = null; K.draft = null; renderList(); }
    renderModule();
    if (!item && K.pageGraphId && previousGraph !== K.pageTab + ':' + K.pageGraphId) K.graphCatalog.enter(K.pageTab,K.pageGraphId);
    renderModules();
    window.scrollTo(0,0);
  }
  function requestLeave(action) {
    if (!K.dirty()) { action(); return; }
    leaveAction = action; if (!$('leaveDialog').open) $('leaveDialog').showModal();
  }
  function saveDraft(notify = true) {
    const error = K.basicError(K.draft.name,K.currentId);
    if (error) { K.notify(error); return false; }
    if (!K.save()) return false;
    K.refresh(); if (notify) K.notify('草稿已保存，尚未发布'); return true;
  }
  function onHashChange() {
    const params = new URLSearchParams(location.hash.slice(1)), id = params.get('edit');
    const selectedTab = params.get('tab'), tab = ['visualization','application'].includes(selectedTab) ? 'quality' : Object.hasOwn(moduleDescriptions,selectedTab) ? selectedTab : 'modeling';
    const graphId = ['extraction','fusion','quality'].includes(tab) ? params.get('graph') : null;
    if (id === K.currentId && (id || (tab === K.pageTab && graphId === K.pageGraphId))) return;
    // 先完成当前弹窗，避免浏览器返回后把未确认内容写入其他本体。
    if (document.querySelector('dialog[open]')) {
      replaceHash(currentHash()); K.notify('请先完成或关闭当前弹窗，再切换页面。'); return;
    }
    if (K.dirty()) { replaceHash(currentHash()); requestLeave(() => route(id,false,tab,graphId)); }
    else route(id,true,tab,graphId);
  }
  // 页签点击和跨页查看本体共用离开保护，不绕过未确认的弹窗。
  function navigate(action) {
    if (document.querySelector('dialog[open]')) { K.notify('请先完成或关闭当前弹窗，再切换页面。'); return; }
    requestLeave(action);
  }
  K.navigateTab = tab => navigate(() => route(null,false,tab,null));
  K.navigateGraph = (tab,id) => navigate(() => route(null,false,tab,id));
  K.openOntology = id => navigate(() => route(id));
  function hasUnsavedChanges() {
    return K.dirty() || ($('ontologyDialog').open && originalBasic !== basicValues()) || K.editor.hasPropertyChanges() || K.extractWizard.hasUnsavedChanges();
  }
  function basicValues() {
    return JSON.stringify({name:$('ontologyName').value,description:$('ontologyDesc').value,ai:$('createWithAI').checked});
  }
  function openBasic(mode) {
    if (mode === 'edit' && K.locked()) return;
    basicMode = mode; basicOwnerId = K.currentId;
    $('basicTitle').textContent = mode === 'create' ? '新增本体' : '编辑基本信息';
    $('saveOntology').textContent = mode === 'create' ? '创建草稿' : '确定';
    $('ontologyName').value = mode === 'create' ? '' : K.draft.name;
    $('ontologyDesc').value = mode === 'create' ? '' : K.draft.description;
    $('createWithAI').checked = false;
    $('aiCreateOption').hidden = mode !== 'create'; $('createNotice').hidden = mode !== 'create';
    $('editorError').hidden = true; updateLengths(); originalBasic = basicValues(); $('ontologyDialog').showModal(); $('ontologyName').focus();
  }
  function updateLengths() {
    $('nameLength').textContent = $('ontologyName').value.length + ' / 50';
    $('descLength').textContent = $('ontologyDesc').value.length + ' / 200';
    $('editorError').hidden = true;
  }
  function closeBasic() {
    if (originalBasic === basicValues()) { $('ontologyDialog').close(); return; }
    K.confirm({title:'放弃本次填写？',text:'尚未确认的名称和描述将不予保留。',label:'放弃',danger:true,action:() => $('ontologyDialog').close()});
  }
  function submitBasic(event) {
    event.preventDefault();
    if (basicMode === 'edit' && (!K.draft || basicOwnerId !== K.currentId || K.locked())) {
      $('ontologyDialog').close(); K.notify('当前本体不可修改，请重新进入编辑。'); return;
    }
    const name = $('ontologyName').value.trim(), description = $('ontologyDesc').value.trim();
    const error = K.basicError(name,basicMode === 'edit' ? K.currentId : null);
    if (error) { $('editorError').textContent = error; $('editorError').hidden = false; $('ontologyName').focus(); return; }
    $('ontologyDialog').close();
    if (basicMode === 'edit') {
      K.draft.name = name; K.draft.description = description; K.editor.changed(); return;
    }
    const ai = $('createWithAI').checked, item = K.create(name,description);
    resetFilters(); route(item.id); K.notify('草稿已创建，请继续完善本体结构');
    if (ai) K.ai.open();
  }
  function listAction(event) {
    const emptyButton = event.target.closest('[data-empty]');
    if (emptyButton) { emptyButton.dataset.empty === 'reset' ? resetFilters() : openBasic('create'); return; }
    const card = event.target.closest('.ontology-card[data-id]'); if (!card || !$('ontologyCards').contains(card)) return;
    const item = K.items.find(value => value.id === card.dataset.id); if (!item) return;
    const action = event.target.closest('[data-action]');
    if (!action) {
      if (!event.target.closest('button, a, input, select, textarea, [contenteditable="true"]')) K.openOntology(item.id);
      return;
    }
    event.stopPropagation();
    if (action.dataset.action === 'edit') { K.openOntology(item.id); return; }
    if (action.dataset.action === 'toggle') {
      const enabled = item.live.enabled;
      K.confirm({title:enabled ? '禁用已发布版本？' : '启用已发布版本？',text:`将${enabled ? '禁用' : '恢复'}“${item.name}”已经审核通过的 v${item.live.version}。${enabled ? '禁用后不可用于新的图谱构建，已有配置会保留。' : '当前未发布草稿不会生效，仍需另行提交审核。'}`,label:enabled ? '禁用' : '启用',action:() => { K.toggle(item); K.extract.syncRecommendations(); K.refresh(); K.notify(enabled ? '已发布版本已禁用' : '已恢复审核通过的版本'); }});
      return;
    }
    K.confirm({title:'删除本体？',text:`确定删除“${item.name}”吗？草稿、已发布配置和审核记录将一并移除，无法撤销。已有抽取任务保留创建时的本体记录。${item.stage === 'reviewing' ? '待审核申请也将被取消。' : ''}`,label:'删除',danger:true,action:() => { K.items = K.items.filter(value => value.id !== item.id); K.extract.syncRecommendations(); K.refresh(); K.notify('本体已删除'); }});
  }
  function listKeyAction(event) {
    // 仅处理卡片自身的键盘入口，卡片中的独立按钮沿用各自行为。
    if (!['Enter',' '].includes(event.key) || !event.target.matches('#ontologyCards > .ontology-card[data-id]')) return;
    event.preventDefault(); event.stopPropagation(); K.openOntology(event.target.dataset.id);
  }
  function initBasics() {
    $('createOntology').addEventListener('click',() => openBasic('create'));
    $('editBasic').addEventListener('click',() => openBasic('edit'));
    $('ontologyForm').addEventListener('submit',submitBasic);
    ['ontologyName','ontologyDesc'].forEach(id => $(id).addEventListener('input',updateLengths));
    ['closeEditor','cancelEditor'].forEach(id => $(id).addEventListener('click',closeBasic));
    $('ontologyDialog').addEventListener('cancel',event => { event.preventDefault(); closeBasic(); });
    ['closeConfirm','cancelConfirm'].forEach(id => $(id).addEventListener('click',() => $('confirmDialog').close()));
    $('acceptConfirm').addEventListener('click',() => { const action = confirmAction; confirmAction = null; $('confirmDialog').close(); action?.(); });
    document.querySelectorAll('[data-close-dialog]').forEach(element => element.addEventListener('click',() => $(element.dataset.closeDialog).close()));
  }
  function initNavigation() {
    $('graphMenu').addEventListener('click',event => { event.preventDefault(); K.navigateTab('modeling'); });
    $('termsMenu').addEventListener('click',event => { event.preventDefault(); K.navigateTab('terms'); });
    $('moduleTabs').addEventListener('click',event => { const button = event.target.closest('[data-module-tab]'); if (button) K.navigateTab(button.dataset.moduleTab); });
    document.querySelectorAll('[data-go-module]').forEach(button => button.addEventListener('click',() => K.navigateTab(button.dataset.goModule)));
    $('backToList').addEventListener('click',() => requestLeave(() => route(null)));
    $('saveDraft').addEventListener('click',() => saveDraft());
    $('stayEditing').addEventListener('click',() => { leaveAction = null; $('leaveDialog').close(); });
    $('discardAndLeave').addEventListener('click',() => { $('leaveDialog').close(); const action = leaveAction; leaveAction = null; action?.(); });
    $('saveAndLeave').addEventListener('click',() => {
      if (!saveDraft(false)) return; $('leaveDialog').close(); const action = leaveAction; leaveAction = null; action?.();
    });
    window.addEventListener('hashchange',onHashChange);
    window.addEventListener('beforeunload',event => { if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
  }
  function initList() {
    $('ontologyCards').addEventListener('click',listAction);
    $('ontologyCards').addEventListener('keydown',listKeyAction);
    $('ontologyStatus').addEventListener('change',event => { K.filter = event.target.value; renderList(); });
    $('resetFilters').addEventListener('click',resetFilters);
    const search = () => { K.keyword = $('ontologySearch').value.trim().toLowerCase(); renderList(); };
    $('searchForm').addEventListener('submit',event => { event.preventDefault(); search(); });
    $('ontologySearch').addEventListener('input',search);
  }
  // 本体列表先独立呈现；其它模块未加载完整时仍由启动提示提供恢复入口。
  renderList();
  K.editor.init(); K.ai.init(); K.reviewUI.init();
  initBasics(); initNavigation(); initList(); K.terminologyUI.init(); K.extractWizard.init(); K.extractionUI.init(); K.resultsUI.init(); K.fusionUI.init(); K.fusionTasks.init(); K.qualityUI.init(); K.qualityActions.init();
  K.scenarios.initialize(); K.graphCatalog.init(); K.applications.init(); K.applicationUI.init(); onHashChange(); K.refresh();
  window.KGPrototypeLoad?.complete();
})();
