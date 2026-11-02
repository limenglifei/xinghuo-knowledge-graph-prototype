/* 发布与审核演示：仅修改当前页面内存中的草稿和审核记录。 */
(() => {
  const $ = KG.$;
  const escape = KG.escape;
  const statusMeta = {
    pending: {label:'审核中',className:'reviewing'},
    approved: {label:'已通过',className:'published'},
    rejected: {label:'已驳回',className:'rejected'},
    withdrawn: {label:'已撤回',className:'draft'}
  };
  let publishId = null;
  let rejectId = null;
  let initialized = false;

  const pendingRecord = () => KG.item()?.history.find(record => record.status === 'pending');
  const sameItem = id => Boolean(id && KG.item()?.id === id);

  function recordMarkup(record) {
    const status = statusMeta[record.status] || statusMeta.withdrawn;
    const remarkLabel = record.status === 'rejected' ? '驳回理由' : '审核备注';
    const remark = record.remark || (record.status === 'pending' ? '等待审核人员处理。' : '暂无');
    return `<article class="review-record" data-review-id="${escape(record.id)}">
      <div class="review-record-head"><strong>${escape(record.type)}</strong>
        <span class="status ${status.className}">${status.label}</span>
        <span class="review-version">v${escape(record.version)}</span></div>
      <div class="review-times"><div><label>提交时间</label><span>${escape(record.submitted)}</span></div>
        <div><label>状态更新时间</label><span>${escape(record.updated)}</span></div></div>
      <div class="review-remark"><strong>${remarkLabel}</strong><span>${escape(remark)}</span></div>
    </article>`;
  }

  function renderHistory() {
    const item = KG.item();
    if (!item) return;
    const type = $('historyType').value;
    const status = $('historyStatus').value;
    const records = item.history.filter(record =>
      (type === 'all' || record.type === type) && (status === 'all' || record.status === status));
    $('reviewHistory').innerHTML = records.length ? records.map(recordMarkup).join('') :
      `<div class="module-empty"><p>${item.history.length ? '没有符合筛选条件的审核记录' : '暂无审核记录'}</p>
        <span>${item.history.length ? '可调整条件或点击重置。' : '保存草稿并提交发布审核后，记录会出现在这里。'}</span></div>`;
    $('historyCount').textContent = records.length === item.history.length ?
      `共 ${records.length} 条审核记录` : `符合条件 ${records.length} 条，共 ${item.history.length} 条`;
    $('reviewDemo').hidden = !pendingRecord();
  }

  function resetFilters() {
    $('historyType').value = 'all';
    $('historyStatus').value = 'all';
    renderHistory();
  }

  function openHistory() {
    if (!KG.item()) return;
    resetFilters();
    if (!$('historyDialog').open) $('historyDialog').showModal();
  }

  /** 提交只使用已保存内容，并把校验失败定位到左侧对应配置。 */
  function canSubmit() {
    if (!KG.item() || KG.locked()) return false;
    if (KG.dirty()) {
      KG.notify('请先保存草稿，再提交发布审核。');
      $('saveDraft').focus();
      return false;
    }
    const error = KG.validate();
    if (!error) return true;
    KG.editor.focusError(error);
    KG.notify(error.message);
    return false;
  }

  function openPublish() {
    if (!canSubmit()) return;
    const item = KG.item();
    publishId = item.id;
    const version = (item.live?.version || 0) + 1;
    $('publishTitle').textContent = item.live ? '提交版本更新审核' : '提交发布审核';
    $('publishSummary').textContent = '确认提交以下已保存的本体定义？审核期间暂不可修改，可撤回后继续编辑。';
    $('publishFacts').innerHTML = `<dt>本体名称</dt><dd>${escape(item.name)}</dd>
      <dt>实体类型</dt><dd>${item.entities.length} 种</dd>
      <dt>关系类型</dt><dd>${item.relations.length} 种</dd>
      <dt>申请类型</dt><dd>${item.live ? '版本更新' : '首次发布'}</dd>
      <dt>待发布版本</dt><dd>v${version}</dd>`;
    $('publishImpact').textContent = !item.live ? '首次审核通过后，本体才可用于图谱构建。保存或提交申请都不会直接发布。' :
      item.live.enabled ? `审核通过前，已发布的 v${item.live.version} 继续可用；审核通过后才会更新为 v${version}。` :
      `当前本体已禁用。审核通过后更新为 v${version}，仍保持禁用；重新启用后才可使用。`;
    $('publishDialog').showModal();
  }

  function confirmPublish() {
    if (!sameItem(publishId)) {
      $('publishDialog').close();
      return;
    }
    if (!canSubmit() || !KG.submit()) return;
    $('publishDialog').close();
    publishId = null;
    KG.refresh();
    KG.notify('发布审核已提交，审核通过后生效。可在审核历史中体验审核结果。');
  }

  function withdrawReview() {
    const item = KG.item();
    if (!item || !pendingRecord()) return;
    const itemId = item.id;
    KG.confirm({
      title:'撤回审核申请',
      text:'撤回后可继续编辑草稿，本次申请会保留在审核历史中。确认撤回吗？',
      label:'确认撤回',danger:false,
      action:() => {
        if (!sameItem(itemId) || !pendingRecord()) return;
        KG.withdraw();
        KG.refresh();
        renderHistory();
        KG.notify('审核申请已撤回，可以继续编辑。');
      }
    });
  }

  function approveReview() {
    const item = KG.item();
    if (!item || !pendingRecord()) return;
    const itemId = item.id;
    KG.confirm({
      title:'演示审核通过',
      text:'本操作仅演示审核通过后的页面状态，不会提交真实审核结果。确认继续？',
      label:'确认通过（演示）',danger:false,
      action:() => {
        if (!sameItem(itemId) || !pendingRecord()) return;
        KG.review(true,'原型演示：本体定义已通过审核。');
        KG.extract.syncRecommendations();
        KG.refresh();
        KG.editor.renderPreview();
        renderHistory();
        KG.notify(KG.item().live.enabled ? '演示审核通过，本体已发布，可以使用。' : '演示审核通过，新版本已发布；本体仍保持禁用。');
      }
    });
  }

  function openReject() {
    if (!pendingRecord()) return;
    rejectId = KG.item().id;
    $('rejectReason').value = '';
    $('rejectError').hidden = true;
    $('rejectDialog').showModal();
    $('rejectReason').focus();
  }

  function rejectReview(event) {
    event.preventDefault();
    if (!sameItem(rejectId) || !pendingRecord()) {
      $('rejectDialog').close();
      return;
    }
    const remark = $('rejectReason').value.trim();
    $('rejectError').hidden = Boolean(remark);
    if (!remark) {
      $('rejectError').textContent = '请填写驳回理由，便于申请人修改后重新提交。';
      $('rejectReason').focus();
      return;
    }
    KG.review(false,remark);
    $('rejectDialog').close();
    rejectId = null;
    KG.refresh();
    renderHistory();
    KG.notify('演示审核已驳回。请根据驳回理由修改，保存后可重新提交。');
  }

  function init() {
    if (initialized) return;
    initialized = true;
    $('showHistory').addEventListener('click',openHistory);
    $('submitReview').addEventListener('click',openPublish);
    $('confirmPublish').addEventListener('click',confirmPublish);
    $('withdrawReview').addEventListener('click',withdrawReview);
    $('historyType').addEventListener('change',renderHistory);
    $('historyStatus').addEventListener('change',renderHistory);
    $('resetHistory').addEventListener('click',resetFilters);
    $('demoApprove').addEventListener('click',approveReview);
    $('demoReject').addEventListener('click',openReject);
    $('rejectForm').addEventListener('submit',rejectReview);
    $('rejectReason').addEventListener('input',() => { $('rejectError').hidden = true; });
  }

  KG.reviewUI = {init,openHistory};
})();
