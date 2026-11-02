/* 质检操作修改当前结果，原报告保留检测快照；任何过期报告都必须重新检测后处理。 */
(() => {
  const K = KG, Q = K.qualityUI, $ = K.$, esc = K.escape;
  let context = null, draft = null, initialized = false;
  const available = id => K.extract.ontologies().find(item => item.id === id);
  const rows = kind => kind === 'entity' ? K.results.entities : K.results.relations;
  const approved = item => item && item.status === 'approved' && !item.mergedInto;
  function validContext() {
    return context && Q.getReport() === context.report && Q.canRepair() && available(context.report.ontologyId);
  }
  function record() { return rows(context.issue.kind).find(item => item.id === context.issue.recordId); }
  function remember(action,before,after) {
    K.results.history.unshift({id:K.uid('quality-action'),action,recordId:before.id,at:K.now(),before:K.clone(before),after:K.clone(after)});
    K.results.touch('quality-' + action);
    K.notify('处理已保存，请重新检测以更新报告。');
  }
  function removeIsolated() {
    const item = record(); if (!approved(item)) { K.notify('该实体已变化，请重新检测。'); return; }
    const owner = context;
    K.confirm({title:'删除孤立实体？',text:`确定删除“${item.name}”吗？仅删除当前图谱结果，不删除原始文档。此操作不可撤销。`,label:'确认删除',danger:true,action:() => {
      if (context !== owner || !validContext() || !approved(record())) { K.notify('数据已更新，请重新检测后处理。'); return; }
      const related = K.results.relations.some(relation => !relation.mergedInto && relation.status !== 'merged' && (relation.fromId === item.id || relation.toId === item.id));
      if (related) { K.notify('该实体仍有关联记录，请先核对并处理关系，避免产生缺失端点。'); return; }
      K.results.entities = K.results.entities.filter(entity => entity.id !== item.id);
      remember('delete',item,null);
    }});
  }
  function mergeRelations() {
    const group = K.results.relations.filter(item => context.issue.relationIds.includes(item.id));
    if (group.length < 2 || group.some(item => !approved(item))) { K.notify('重复关系已变化，请重新检测。'); return; }
    const first = group[0];
    if (group.some(item => item.typeId !== first.typeId || item.fromId !== first.fromId || item.toId !== first.toId)) { K.notify('关系已不再重复，请重新检测。'); return; }
    const fields = [...new Set(group.flatMap(item => Object.keys(item.properties || {})))];
    draft = {merge:true,group,properties:{}};
    $('qualityRepairTitle').textContent = '合并重复关系';
    $('qualityRepairBody').innerHTML = `<p class="q-repair-note">保留第一条关系，将其余记录的文档来源合并。不同属性值请明确选择，合并后保留原始记录以便追溯。</p><div class="q-repair-fields">${fields.map(field => {
      const values = [...new Set(group.map(item => item.properties?.[field]).filter(value => value != null))];
      return `<label>${esc(field)}<select data-quality-merge-field="${esc(field)}">${values.length > 1 ? '<option value="">请选择保留值</option>' : ''}${values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select></label>`;
    }).join('')}</div>`;
    $('qualityRepairError').hidden = true; $('qualityRepairDialog').showModal();
  }
  function saveMerge() {
    if (!validContext()) return '数据已更新，请关闭弹窗并重新检测。';
    const values = {};
    for (const input of $('qualityRepairBody').querySelectorAll('[data-quality-merge-field]')) {
      if (!input.value.trim()) return '请明确选择各项属性的保留值。';
      values[input.dataset.qualityMergeField] = input.value;
    }
    const group = draft.group, keep = group[0], before = K.clone(keep);
    if (group.some(item => !approved(item))) return '关系已处理，请重新检测。';
    const sources = new Map(group.flatMap(item => item.sources || []).map(source => [JSON.stringify(source),source]));
    keep.properties = values; keep.sources = [...sources.values()];
    group.slice(1).forEach(item => { item.status = 'merged'; item.mergedInto = keep.id; });
    $('qualityRepairDialog').close(); remember('merge',before,keep); return '';
  }
  function typeOptions(kind,typeId) {
    const types = context.report.config[kind === 'entity' ? 'entities' : 'relations'];
    return '<option value="">请选择类型</option>' + types.map(type => `<option value="${esc(type.id)}" ${type.id === typeId ? 'selected' : ''}>${esc(type.name)}</option>`).join('');
  }
  function endpointOptions(id) {
    return '<option value="">请选择实体</option>' + K.results.entities.filter(item => item.ontologyId === context.report.ontologyId && approved(item)).map(item => `<option value="${esc(item.id)}" ${item.id === id ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
  }
  function propertyFields() {
    const fields = Q.propertiesFor(context.report.config,draft,context.issue.kind);
    return fields.map(field => `<label>${field.required ? '<span><i class="required">*</i>'+esc(field.name)+'</span>' : esc(field.name)}<input data-quality-property="${esc(field.name)}" maxlength="200" value="${esc(draft.properties?.[field.name] ?? '')}" placeholder="${esc(field.type || '文本')}"><small>${esc(field.type || '文本')}${field.inherited ? ' · 继承属性' : ''}</small></label>`).join('');
  }
  function renderEditor() {
    const entity = context.issue.kind === 'entity', modifying = context.issue.dimension === 'consistency';
    $('qualityRepairBody').innerHTML = `<p class="q-repair-note">请结合来源资料填写。保存仅更新当前结果；本次报告仍保留旧快照，需重新检测。</p><div class="q-repair-fields"><label>${entity ? '实体名称' : '关系类型'}${entity ? `<input id="qualityRepairName" maxlength="50" value="${esc(draft.name)}">` : `<select id="qualityRepairType" ${modifying ? '' : 'disabled'}>${typeOptions('relation',draft.typeId)}</select>`}</label>${entity ? `<label>实体类型<select id="qualityRepairType" ${modifying ? '' : 'disabled'}>${typeOptions('entity',draft.typeId)}</select></label>` : `<label>原实体<select id="qualityRepairFrom" ${modifying ? '' : 'disabled'}>${endpointOptions(draft.fromId)}</select></label><label>目标实体<select id="qualityRepairTo" ${modifying ? '' : 'disabled'}>${endpointOptions(draft.toId)}</select></label>`}</div><div class="q-repair-fields" id="qualityRepairProperties">${propertyFields()}</div><h3>来源依据</h3>${(record().sources || []).map(source => `<section class="q-source"><strong>${esc(source.title)} · 第 ${source.page || 1} 页</strong><p>${esc(source.quote || '暂无原文')}</p></section>`).join('')}`;
  }
  function openRepair() {
    if (!approved(record())) { K.notify('记录已变化，请重新检测。'); return; }
    draft = K.clone(record());
    $('qualityRepairTitle').textContent = context.issue.dimension === 'completeness' ? '补充缺失属性' : '修改约束问题';
    $('qualityRepairError').hidden = true; renderEditor(); $('qualityRepairDialog').showModal();
  }
  function readDraft() {
    draft.typeId = $('qualityRepairType').value;
    if (context.issue.kind === 'entity') draft.name = $('qualityRepairName').value.trim();
    else { draft.fromId = $('qualityRepairFrom').value; draft.toId = $('qualityRepairTo').value; }
    $('qualityRepairBody').querySelectorAll('[data-quality-property]').forEach(input => { draft.properties[input.dataset.qualityProperty] = input.value.trim(); });
  }
  function checkDraft() {
    const report = {...context.report,entities:K.results.entities.filter(item => item.ontologyId === context.report.ontologyId && approved(item)),relations:K.results.relations.filter(item => item.ontologyId === context.report.ontologyId && approved(item))};
    if (context.issue.kind === 'entity') report.entities = report.entities.map(item => item.id === draft.id ? draft : item);
    const errors = Q.consistencyReasons(report,draft,context.issue.kind);
    const required = Q.propertiesFor(report.config,draft,context.issue.kind).filter(field => field.required && Q.missing(draft.properties[field.name]));
    if (required.length) errors.push('请补充必填属性：'+required.map(field => field.name).join('、'));
    if (context.issue.kind === 'entity') {
      const invalid = report.relations.filter(relation => relation.fromId === draft.id || relation.toId === draft.id).filter(relation => Q.consistencyReasons(report,relation,'relation').length);
      if (invalid.length) errors.push('修改后会违反关联关系的类型约束，请调整实体类型。');
    }
    return errors.join('；');
  }
  function save(event) {
    event.preventDefault();
    let message = '';
    if (!validContext()) message = '数据已更新，请关闭弹窗并重新检测。';
    else if (draft.merge) message = saveMerge();
    else {
      readDraft(); message = checkDraft();
      if (!message) {
        const current = record(), before = K.clone(current);
        Object.assign(current,K.clone(draft)); $('qualityRepairDialog').close(); remember('edit',before,current);
      }
    }
    if (message) { $('qualityRepairError').textContent = message; $('qualityRepairError').hidden = false; }
  }
  /** 以本次报告的具体问题进入处理，避免同一实体多种问题时打开错误动作。 */
  function open(id) {
    const report = Q.getReport(), issue = report?.issues.find(item => item.id === id);
    if (!issue) return;
    context = {report,issue};
    if (Q.isHistorical()) { K.notify('历史报告只读，请查看最新报告或重新质检后处理。'); return; }
    if (!validContext()) { K.notify('报告对应的数据已更新，请重新检测后处理。'); return; }
    if (issue.dimension === 'isolation') { removeIsolated(); return; }
    if (issue.dimension === 'duplicates' && issue.kind === 'entity') {
      if (K.navigateGraph) K.navigateGraph('fusion',report.ontologyId);
      else K.navigateTab('fusion');
      K.fusionUI.focus({ontologyId:report.ontologyId,entityIds:issue.entityIds,category:'alignment'}); return;
    }
    if (issue.dimension === 'duplicates') { mergeRelations(); return; }
    openRepair();
  }
  function changed(event) {
    if (!draft || draft.merge) return;
    if (event.target.id === 'qualityRepairType') { readDraft(); renderEditor(); return; }
    if (context.issue.kind !== 'entity') return;
    const nameProperty = $('qualityRepairBody').querySelector('[data-quality-property="名称"]');
    if (event.target.id === 'qualityRepairName' && nameProperty) nameProperty.value = event.target.value;
    if (event.target.dataset.qualityProperty === '名称') $('qualityRepairName').value = event.target.value;
  }
  function init() {
    if (initialized) return; initialized = true;
    const dialog = document.createElement('dialog'); dialog.id = 'qualityRepairDialog'; dialog.className = 'q-detail-dialog'; dialog.setAttribute('aria-labelledby','qualityRepairTitle');
    dialog.innerHTML = '<form class="dialog-layout" id="qualityRepairForm" novalidate><header class="dialog-header"><h2 id="qualityRepairTitle"></h2><button class="close" type="button" data-quality-repair-close aria-label="关闭问题处理">×</button></header><div class="dialog-body"><p class="form-error" id="qualityRepairError" role="alert" hidden></p><div id="qualityRepairBody"></div></div><footer class="dialog-footer"><button class="btn" type="button" data-quality-repair-close>取消</button><button class="btn primary" type="submit">保存处理</button></footer></form>';
    document.body.append(dialog);
    $('qualityRepairForm').addEventListener('submit',save);
    dialog.addEventListener('click',event => { if (event.target.closest('[data-quality-repair-close]')) dialog.close(); });
    dialog.addEventListener('input',changed); dialog.addEventListener('change',event => { if (event.target.id === 'qualityRepairType') changed(event); });
  }
  K.qualityActions = {init,open};
})();
