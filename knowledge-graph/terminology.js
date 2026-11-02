/* 术语库与融合共用当前页面状态；已执行任务另存参考快照，不随术语编辑回写。 */
(() => {
  const K = KG, $ = K.$, esc = K.escape;
  const libraries = [
    {id:'medical-terms',name:'医药标准术语库',description:'统一药品、疾病与人群的名称表达，为医药知识融合提供参考。',enabled:true,updated:'2026-10-08 09:30',terms:[
      {id:'term-amox',name:'阿莫西林胶囊',aliases:['阿莫西林（胶囊）','阿莫西林胶囊剂'],definition:'以阿莫西林为主要成分的胶囊剂型药品。',enabled:true},
      {id:'term-ibu',name:'布洛芬缓释胶囊',aliases:['布洛芬缓释制剂'],definition:'布洛芬的缓释胶囊剂型。',enabled:true},
      {id:'term-fever',name:'发热',aliases:['发烧'],definition:'体温升高的临床表现。',enabled:true},
      {id:'term-adult',name:'成人',aliases:['成年人'],definition:'已达到成年年龄的人群。',enabled:true},
      {id:'term-old',name:'旧版药品分类',aliases:[],definition:'历史用语，暂不用于新的融合任务。',enabled:false}
    ]},
    {id:'company-terms',name:'企业组织术语库',description:'企业名称、组织简称与常见管理术语。',enabled:true,updated:'2026-10-07 15:20',terms:[
      {id:'term-org',name:'有限责任公司',aliases:['有限公司'],definition:'依照公司章程由股东出资设立的企业组织形式。',enabled:true}
    ]},
    {id:'product-terms',name:'产品术语库',description:'待整理的产品名称与规格表达。',enabled:false,updated:'2026-10-06 11:00',terms:[]}
  ];
  const state = {libraryId:null,query:'',status:'all',page:1};
  let initialized = false, editor = null;
  const library = () => libraries.find(item => item.id === state.libraryId);
  const normal = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const available = () => libraries.filter(item => item.enabled && item.terms.some(term => term.enabled));
  const enabled = item => `<span class="status ${item.enabled ? '' : 'off'}">${item.enabled ? '已启用' : '已禁用'}</span>`;
  const action = (name,id,label,extra = '') => `<button type="button" class="link-btn ${extra}" data-term-action="${name}" data-term-id="${esc(id)}">${label}</button>`;
  function change() {
    if (library()) library().updated = K.now();
    document.dispatchEvent(new CustomEvent('kg:terms-change'));
    render();
  }
  function matches(item) {
    return (state.status === 'all' || item.enabled === (state.status === 'enabled')) &&
      normal([item.name,item.description,item.definition,...(item.aliases || [])].join(' ')).includes(normal(state.query));
  }
  function card(item) {
    return `<article class="ontology-card term-card" data-term-library="${esc(item.id)}" tabindex="0" role="button" aria-label="进入${esc(item.name)}详情"><div class="card-main"><div class="card-heading"><h2 class="card-title" title="${esc(item.name)}">${esc(item.name)}</h2>${enabled(item)}</div><p class="card-desc">${esc(item.description || '暂无描述')}</p><div class="card-stats"><span><strong>${item.terms.length}</strong>条术语</span><span>${item.terms.filter(term => term.enabled).length} 条已启用</span></div><p class="created">更新于 ${esc(item.updated)}</p></div><footer class="card-footer">${action('open-library',item.id,'编辑')}${action('toggle-library',item.id,item.enabled ? '禁用' : '启用')}${action('delete-library',item.id,'删除','danger')}</footer></article>`;
  }
  function row(item) {
    return `<tr data-term-row="${esc(item.id)}"><td><strong>${esc(item.name)}</strong></td><td>${item.aliases.length ? item.aliases.map(alias => `<span class="term-alias">${esc(alias)}</span>`).join('') : '—'}</td><td>${esc(item.definition || '暂无释义')}</td><td>${enabled(item)}</td><td>${action('edit-term',item.id,'编辑')}${action('toggle-term',item.id,item.enabled ? '禁用' : '启用')}${action('delete-term',item.id,'删除','danger')}</td></tr>`;
  }
  function renderRows() {
    const owner = library(), items = (owner ? owner.terms : libraries).filter(matches), size = owner ? 8 : 6;
    state.page = Math.max(1,Math.min(state.page,Math.ceil(items.length / size) || 1));
    const shown = items.slice((state.page - 1) * size,state.page * size);
    $('termsCount').textContent = `共 ${items.length} ${owner ? '条术语' : '个术语库'}`;
    $('termsResults').innerHTML = !shown.length ? `<div class="empty"><h2>${state.query || state.status !== 'all' ? '没有符合条件的结果' : owner ? '还没有术语' : '还没有术语库'}</h2><p>${state.query || state.status !== 'all' ? '请调整筛选条件，或重置后查看全部。' : '点击右上角新增，开始整理标准名称。'}</p>${action('reset','','重置筛选')}</div>` : owner ?
      `<div class="term-table-wrap"><table class="term-table"><thead><tr><th>标准术语</th><th>别名</th><th>释义</th><th>状态</th><th>操作</th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>` : `<div class="cards">${shown.map(card).join('')}</div>`;
    $('termsPagination').innerHTML = `<span>第 ${state.page} / ${Math.ceil(items.length / size) || 1} 页</span><button class="btn small" data-term-action="prev" ${state.page === 1 ? 'disabled' : ''}>上一页</button><button class="btn small" data-term-action="next" ${state.page * size >= items.length ? 'disabled' : ''}>下一页</button>`;
  }
  /** 保留当前目录和筛选，切换主菜单不会丢失当前页面已保存的术语。 */
  function render() {
    if (!initialized) return;
    const owner = library();
    $('termsHeading').textContent = owner?.name || '术语库';
    $('termsDescription').textContent = owner ? owner.description || '统一维护标准术语、别名与释义。' : '统一管理标准术语、别名与释义，为知识融合提供参考。';
    $('termsBack').hidden = !owner;
    $('termsEditLibrary').hidden = !owner;
    $('termsEditLibrary').dataset.termId = owner?.id || '';
    $('termsNew').textContent = owner ? '＋ 新增术语' : '＋ 新建术语库';
    $('termsLibraryNotice').hidden = !owner || owner.enabled;
    $('termsSearch').placeholder = owner ? '搜索标准术语、别名或释义' : '搜索术语库名称或描述';
    $('termsSearch').value = state.query; $('termsStatus').value = state.status;
    renderRows();
  }
  function reset() { state.query = ''; state.status = 'all'; state.page = 1; render(); }
  /** 卡片进入详情时将键盘焦点移到标题，避免焦点留在已移除的列表卡片上。 */
  function openLibrary(id) {
    if (!libraries.some(item => item.id === id)) return;
    state.libraryId = id; reset(); $('termsHeading').focus({preventScroll:true});
  }
  function openEditor(kind,id) {
    const owner = library(), item = kind === 'library' ? libraries.find(value => value.id === id) : owner?.terms.find(value => value.id === id);
    editor = {kind,id,libraryId:owner?.id};
    $('termEditorTitle').textContent = `${item ? '编辑' : '新增'}${kind === 'library' ? '术语库' : '术语'}`;
    $('termNameLabel').textContent = kind === 'library' ? '术语库名称' : '标准术语';
    $('termDefinitionLabel').textContent = kind === 'library' ? '描述' : '释义';
    $('termName').value = item?.name || ''; $('termDefinition').value = item?.description || item?.definition || '';
    $('termAliases').value = item?.aliases?.join('，') || ''; $('termAliasesField').hidden = kind === 'library';
    $('termEnabled').checked = item ? item.enabled : true; $('termEditorError').hidden = true;
    $('termEditorDialog').showModal(); $('termName').focus();
  }
  function editorError(text) { $('termEditorError').textContent = text; $('termEditorError').hidden = false; }
  function save(event) {
    event.preventDefault();
    const owner = libraries.find(item => item.id === editor.libraryId), isLibrary = editor.kind === 'library';
    if (!isLibrary && !owner) { editorError('该术语库已不存在，请返回列表。'); return; }
    const items = isLibrary ? libraries : owner.terms, name = $('termName').value.trim();
    const aliases = [...new Set($('termAliases').value.split(/[,，;\n；]/).map(value => value.trim()).filter(Boolean))];
    if (!name || name.length > 50) { editorError('请填写 1–50 个字的名称。'); return; }
    if (items.some(item => item.id !== editor.id && normal(item.name) === normal(name))) { editorError('名称已存在，请换一个名称。'); return; }
    if (!isLibrary && (aliases.length > 10 || aliases.some(alias => alias.length > 50))) { editorError('最多填写 10 个别名，每个不超过 50 个字。'); return; }
    if (!isLibrary && aliases.some(alias => normal(alias) === normal(name))) { editorError('别名不能与标准术语相同。'); return; }
    const value = {name,enabled:$('termEnabled').checked};
    if (isLibrary) Object.assign(value,{description:$('termDefinition').value.trim(),updated:K.now()});
    else Object.assign(value,{aliases,definition:$('termDefinition').value.trim()});
    const existing = items.find(item => item.id === editor.id);
    if (existing) Object.assign(existing,value);
    else {
      items.unshift({id:K.uid(isLibrary ? 'term-library' : 'term'),...value,...(isLibrary ? {terms:[]} : {})});
      state.page = 1; state.query = ''; state.status = 'all';
    }
    $('termEditorDialog').close(); change(); K.notify('已保存');
  }
  function mutate(name,id) {
    const isLibrary = name.endsWith('library'), owner = library(), items = isLibrary ? libraries : owner?.terms;
    const item = items?.find(value => value.id === id); if (!item) return;
    const remove = name.startsWith('delete'), title = remove ? '删除' : item.enabled ? '禁用' : '启用';
    K.confirm({title:`${title}${isLibrary ? '术语库' : '术语'}？`,text:`${title}“${item.name}”${remove ? (isLibrary ? '将同时删除库内术语。此操作不可撤销。' : '后不可恢复。') : item.enabled ? '后，新的融合任务不再参考这些术语。' : '后，可用于新的融合任务。'}已执行任务保留原参考记录。`,label:title,danger:remove,action:() => {
      if (remove) items.splice(items.indexOf(item),1); else item.enabled = !item.enabled;
      if (isLibrary && !remove) item.updated = K.now();
      if (isLibrary && state.libraryId === id && remove) state.libraryId = null;
      change(); K.notify(`已${title}`);
    }});
  }
  function handleAction(event) {
    const button = event.target.closest('[data-term-action]');
    if (!button) {
      const card = event.target.closest('[data-term-library]');
      if (card) openLibrary(card.dataset.termLibrary);
      return;
    }
    // 卡片内各按钮只执行自身动作；编辑复用详情入口，启停和删除不跳转。
    event.stopPropagation();
    const {termAction:name,termId:id} = button.dataset;
    if (name === 'open-library') { openLibrary(id); return; }
    if (name === 'back') { state.libraryId = null; reset(); return; }
    if (name === 'reset') { reset(); return; }
    if (name === 'new') { openEditor(library() ? 'term' : 'library'); return; }
    if (name.startsWith('edit-')) { openEditor(name.slice(5),id); return; }
    if (['prev','next'].includes(name)) { state.page += name === 'prev' ? -1 : 1; renderRows(); return; }
    mutate(name,id);
  }
  function handleCardKey(event) {
    const card = event.target.closest('[data-term-library]');
    if (!card || event.target !== card || !['Enter',' '].includes(event.key)) return;
    event.preventDefault(); openLibrary(card.dataset.termLibrary);
  }
  function mountEditor() {
    const dialog = document.createElement('dialog'); dialog.id = 'termEditorDialog'; dialog.className = 'term-editor';
    dialog.setAttribute('aria-labelledby','termEditorTitle');
    dialog.innerHTML = `<form class="dialog-layout" id="termEditorForm" novalidate><header class="dialog-header"><h2 id="termEditorTitle"></h2><button class="close" type="button" data-term-close aria-label="关闭术语编辑">×</button></header><div class="dialog-body"><p class="form-error" id="termEditorError" role="alert" hidden></p><label class="term-field"><span><i class="required">*</i><span id="termNameLabel"></span></span><input id="termName" maxlength="50" required placeholder="请输入名称"></label><label class="term-field" id="termAliasesField">别名<input id="termAliases" maxlength="500" placeholder="多个别名用逗号分隔"><small class="help">最多 10 个别名，便于识别同一概念的不同表达。</small></label><label class="term-field"><span id="termDefinitionLabel"></span><textarea id="termDefinition" rows="3" maxlength="500" placeholder="说明含义及适用范围"></textarea></label><label class="term-check"><input id="termEnabled" type="checkbox">保存后启用</label></div><footer class="dialog-footer"><button class="btn" type="button" data-term-close>取消</button><button class="btn primary" type="submit">保存</button></footer></form>`;
    document.body.append(dialog); $('termEditorForm').addEventListener('submit',save);
    dialog.addEventListener('click',event => { if (event.target.closest('[data-term-close]')) dialog.close(); });
  }
  function init() {
    if (initialized) return; initialized = true;
    $('terminologyPage').innerHTML = `<button class="link-btn term-back" id="termsBack" data-term-action="back" hidden>← 返回术语库</button><div class="page-head"><div><h1 id="termsHeading" tabindex="-1">术语库</h1><p class="page-desc" id="termsDescription"></p></div><div class="term-head-actions"><button class="btn" id="termsEditLibrary" data-term-action="edit-library" hidden>编辑基本信息</button><button class="btn primary" id="termsNew" data-term-action="new">＋ 新建术语库</button></div></div><p class="term-disabled-note" id="termsLibraryNotice" hidden>此术语库已禁用，仍可维护内容，但不会被新的融合任务引用。</p><form class="filter-bar" id="termsFilter"><input id="termsSearch" type="search" maxlength="50" aria-label="搜索术语库或术语"><select id="termsStatus" aria-label="术语启用状态"><option value="all">全部状态</option><option value="enabled">已启用</option><option value="disabled">已禁用</option></select><button class="btn" type="submit">搜索</button><button class="link-btn" type="button" data-term-action="reset">重置</button><span class="result-count" id="termsCount"></span></form><div id="termsResults"></div><div class="term-pagination" id="termsPagination"></div><p class="preview-note">新增与修改仅在本次页面中生效；已创建的融合任务保留当时的术语参考。</p>`;
    $('terminologyPage').addEventListener('click',handleAction);
    $('terminologyPage').addEventListener('keydown',handleCardKey);
    const filter = () => { state.query = $('termsSearch').value; state.status = $('termsStatus').value; state.page = 1; renderRows(); };
    $('termsFilter').addEventListener('submit',event => { event.preventDefault(); filter(); });
    $('termsSearch').addEventListener('input',filter); $('termsStatus').addEventListener('change',filter);
    mountEditor(); render();
  }
  K.terms = {libraries,available};
  K.terminologyUI = {init,render};
})();
