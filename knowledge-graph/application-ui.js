/* 发布审核嵌入质检结果页；质检结论与发布状态独立，审核固定当次图谱。 */
(() => {
  const K = KG, $ = K.$, esc = K.escape;
  const reviewLabels = {pending:'审核中',approved:'已通过',rejected:'已驳回',withdrawn:'已撤回'};
  const reviewClasses = {pending:'reviewing',approved:'published',rejected:'rejected',withdrawn:'draft'};
  let initialized = false, historyId = '', publishContext = null;
  const A = () => K.applications;
  const action = (name,id,label,primary = false,disabled = false) => '<button class="' + (primary ? 'btn primary' : 'link-btn') + '" data-application-action="' + name + '" data-application-id="' + esc(id) + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';

  function canUseCurrentReport(id) {
    const displayed = K.qualityUI.getReport(), current = A().reportFor(id);
    return Boolean(K.pageTab === 'quality' && K.pageGraphId === id && displayed && current &&
      displayed.reportId === current.reportId && !K.qualityUI.isHistorical());
  }
  function controls(report) {
    const id = report?.ontologyId || K.pageGraphId;
    if (!id) return '';
    const item = A().get(id), historical = K.qualityUI.isHistorical();
    let buttons = action('history',id,'审核历史');
    if (historical) return buttons;
    if (item?.live) buttons += action('toggle',id,item.live.enabled ? '禁用已发布版本' : '启用已发布版本',false,!item.live.enabled && item.stage === 'reviewing');
    if (!report || ['reviewing','published'].includes(item?.stage)) return buttons;
    const label = item?.stage === 'rejected' ? '重新提交审核' : item?.live ? '提交变更审核' : '提交发布审核';
    return action('submit',id,label,true,!canUseCurrentReport(id)) + buttons;
  }
  function assessment(report) {
    const result = A().assessReport(report), item = A().get(report.ontologyId);
    const title = result.majorCount ? '请先处理重大问题，再重新质检' :
      result.eligible ? '图谱质量良好，建议核对后正式提交发布审核' : '建议先完善图谱，再提交发布审核';
    let note = result.majorCount ? '必填信息缺失或约束错误可能影响图谱使用，请先修正。' :
      result.eligible ? '评分达到 95–100 分且未发现重大问题。请核对图谱内容、来源依据与使用范围，审核通过后再正式启用。' :
      '综合评分尚未达到 95 分，请按下方明细处理问题并重新质检。';
    let heading = title, tone = result.eligible ? 'ready' : 'warning';
    if (K.qualityUI.isHistorical()) { heading = '历史报告仅供查阅，不能用于本次发布'; note = '请返回最新报告后核对并提交。'; tone = 'neutral'; }
    else if (K.qualityUI.overview(report.ontologyId).loading) { heading = '正在重新质检，请等待最新结果'; note = '下方暂时保留上一份报告，检测完成前不可提交发布审核。'; tone = 'neutral'; }
    else if (K.qualityUI.isStale()) { heading = '图谱内容已变化，请重新质检'; note = '当前评分仅代表上次检测内容，不能用于本次发布。'; tone = 'warning'; }
    else if (item?.stage === 'reviewing') { heading = '发布申请已提交，等待审核'; note = '质检已达标，最终发布结果请查看审核历史。'; tone = 'neutral'; }
    else if (item?.stage === 'published') { heading = '本次图谱已通过发布审核'; note = item.live.enabled ? '当前已发布并启用，可继续浏览图谱或查看审核记录。' : '当前已发布但处于禁用状态，可核对后重新启用。'; }
    return '<section class="q-readiness ' + tone + '" id="qualityReadiness" role="status"><div><strong>' + heading +
      '</strong><p>' + note + '</p><small>' + report.issues.length + ' 项待核对：' + result.majorCount + ' 项重大问题 · ' + result.reviewCount +
      ' 项一般提示</small></div>' + (report.issues.length ? '<button class="link-btn" data-quality-filter="all">查看待核对事项</button>' : '') + '</section>';
  }
  function render() {
    if (!initialized) return;
    if (K.pageTab === 'quality') K.qualityUI.render();
    if ($('applicationHistoryDialog').open) renderHistory();
  }
  function complete(result,message) {
    if (!result?.ok) { K.notify(result?.error || '当前操作未完成，请核对最新报告后重试。'); render(); return false; }
    render(); K.graphCatalog.render(); K.notify(message); return true;
  }
  function submit(id) {
    const item = A().get(id), report = A().reportFor(id);
    if (!item || !canUseCurrentReport(id)) { K.notify('请查看最新有效报告，达到 95 分且无重大问题后再提交。'); render(); return; }
    publishContext = {id,reportId:report.reportId};
    $('graphPublishSummary').textContent = '将提交“' + item.name + '”的质检报告 V' + report.reportVersion + '对应图谱：' + report.score + ' 分，' + report.entities.length + ' 个实体、' + report.relations.length + ' 条关系。';
    $('graphPublishIssues').textContent = report.issues.length ? '本次有 ' + report.issues.length + ' 项一般提示，请先核对，确认不影响使用后再提交。' : '本次未发现质量问题，请继续确认图谱内容及使用范围。';
    $('graphPublishImpact').textContent = '审核通过后发布为图谱 v' + ((item.live?.version || 0) + 1) + '。' +
      (item.live ? '审核期间，现有发布版本保持不变。' + (!item.live.enabled ? '审核通过后仍保持禁用。' : '') : '提交申请不会立即发布，审核通过后正式启用。');
    $('graphPublishError').hidden = true;
    $('graphPublishDialog').querySelectorAll('input[type=checkbox]').forEach(input => { input.checked = false; });
    $('graphPublishConfirm').disabled = true; $('graphPublishDialog').showModal();
  }
  function confirmSubmit(event) {
    event.preventDefault();
    const context = publishContext;
    const checked = [...$('graphPublishDialog').querySelectorAll('input[type=checkbox]')].every(input => input.checked);
    if (!context || !checked) return;
    if (!canUseCurrentReport(context.id) || A().reportFor(context.id)?.reportId !== context.reportId) {
      $('graphPublishError').textContent = '报告或图谱内容已变化，请关闭弹窗，重新核对最新报告。'; $('graphPublishError').hidden = false; return;
    }
    const result = A().submit(context.id);
    if (result.ok) { $('graphPublishDialog').close(); publishContext = null; }
    complete(result,'已提交发布审核，可在审核历史查看处理结果。');
  }
  function canWithdrawRecord(id,recordId) {
    const item = A().get(id);
    return K.pageTab === 'quality' && K.pageGraphId === id && !K.qualityUI.isHistorical() &&
      item?.stage === 'reviewing' && item.history.find(record => record.status === 'pending')?.id === recordId;
  }
  /** 撤回绑定具体申请；确认期间出现新申请时，不将旧操作作用到新记录。 */
  function withdraw(id,recordId) {
    if (!canWithdrawRecord(id,recordId)) { K.notify('该申请状态已变化，请核对最新审核记录。'); renderHistory(); return; }
    K.confirm({title:'撤回发布审核申请？',text:'撤回后回到草稿状态，本次申请保留在审核历史中。已发布版本不受影响。',
      label:'确认撤回',action:() => {
        if (!canWithdrawRecord(id,recordId)) { K.notify('该申请状态已变化，未撤回其他申请。'); renderHistory(); return; }
        complete(A().withdraw(id),'审核申请已撤回。');
      }});
  }
  function toggle(id) {
    const item = A().get(id); if (!item?.live) return;
    const enabled = item.live.enabled;
    K.confirm({title:enabled ? '禁用已发布图谱？' : '启用已发布图谱？',label:enabled ? '确认禁用' : '确认启用',
      text:'将' + (enabled ? '停用' : '恢复') + '“' + item.name + '”已审核通过的图谱 v' + item.live.version + '。图谱内容及审核记录均会保留。',
      action:() => {
        if (A().get(id)?.live?.enabled !== enabled) { K.notify('启停状态已变化，请核对后重试。'); return; }
        complete(A().toggle(id),enabled ? '已发布图谱已禁用。' : '已发布图谱已启用。');
      }});
  }
  function historyRecord(record) {
    const withdrawButton = canWithdrawRecord(historyId,record.id) ? '<div class="application-history-actions"><button class="link-btn" data-application-withdraw="' + esc(record.id) + '" data-application-id="' + esc(historyId) + '">撤回申请</button></div>' : '';
    return '<article class="review-record" data-application-record="' + esc(record.id) + '"><div class="review-record-head"><strong>' + esc(record.type) + '</strong><span class="status ' + reviewClasses[record.status] + '">' +
      reviewLabels[record.status] + '</span><span class="review-version">图谱 v' + record.version + '</span></div><div class="review-times"><div><label>提交时间</label><span>' +
      esc(record.submitted) + '</span></div><div><label>状态更新时间</label><span>' + esc(record.updated) + '</span></div></div><p class="help">对应质检报告 V' +
      record.report.reportVersion + ' · ' + record.report.entities.length + ' 个实体 · ' + record.report.relations.length + ' 条关系</p><div class="review-remark"><strong>' +
      (record.status === 'rejected' ? '驳回理由' : '审核备注') + '</strong><span>' + esc(record.remark || '等待审核人员处理。') + '</span></div>' + withdrawButton + '</article>';
  }
  function renderHistory() {
    const item = A().get(historyId), filter = $('applicationHistoryStatus').value;
    $('applicationHistoryName').textContent = item?.name || '图谱';
    const records = (item?.history || []).filter(record => filter === 'all' || record.status === filter);
    $('applicationHistoryRecords').innerHTML = records.length ? records.map(historyRecord).join('') : '<div class="module-empty"><p>暂无符合条件的审核记录</p><span>提交发布申请后，审核记录会显示在这里。</span></div>';
    $('applicationHistoryCount').textContent = '共 ' + records.length + ' 条审核记录';
  }
  function openHistory(id) {
    historyId = id; $('applicationHistoryStatus').value = 'all'; renderHistory(); $('applicationHistoryDialog').showModal();
  }
  function mountHistory() {
    const dialog = document.createElement('dialog'); dialog.id = 'applicationHistoryDialog'; dialog.className = 'history-drawer'; dialog.setAttribute('aria-labelledby','applicationHistoryTitle');
    dialog.innerHTML = '<div class="dialog-layout"><header class="dialog-header"><div><h2 id="applicationHistoryTitle">发布审核历史</h2><p class="help" id="applicationHistoryName"></p></div><button class="close" data-application-close="applicationHistoryDialog" aria-label="关闭发布审核历史">×</button></header><div class="dialog-body"><label class="application-history-filter">审核状态<select id="applicationHistoryStatus"><option value="all">全部状态</option>' +
      Object.entries(reviewLabels).map(([value,label]) => '<option value="' + value + '">' + label + '</option>').join('') + '</select></label><div id="applicationHistoryRecords"></div></div><footer class="dialog-footer"><span class="footer-note" id="applicationHistoryCount"></span><button class="btn" data-application-close="applicationHistoryDialog">关闭</button></footer></div>';
    document.body.appendChild(dialog);
    $('applicationHistoryStatus').addEventListener('change',renderHistory);
    dialog.addEventListener('click',event => {
      const close = event.target.closest('[data-application-close]'); if (close) dialog.close();
      const button = event.target.closest('[data-application-withdraw]');
      if (button) withdraw(button.dataset.applicationId,button.dataset.applicationWithdraw);
    });
  }

  function mountPublish() {
    const dialog = document.createElement('dialog');
    dialog.id = 'graphPublishDialog'; dialog.className = 'publish-dialog'; dialog.setAttribute('aria-labelledby','graphPublishTitle');
    dialog.innerHTML = '<form id="graphPublishForm"><header class="dialog-header"><h2 id="graphPublishTitle">提交发布审核</h2><button type="button" class="close" data-publish-close aria-label="关闭发布审核">×</button></header><div class="dialog-body"><p id="graphPublishSummary"></p><p class="q-publish-note" id="graphPublishIssues"></p><div class="q-publish-checklist"><label><input type="checkbox">已核对实体、关系和来源依据</label><label><input type="checkbox">已核对待确认事项，确认不存在影响使用的重大问题</label><label><input type="checkbox">已确认本次发布内容及使用范围</label></div><p class="help" id="graphPublishImpact"></p><p class="form-error" id="graphPublishError" hidden></p></div><footer class="dialog-footer"><button type="button" class="btn" data-publish-close>取消</button><button type="submit" class="btn primary" id="graphPublishConfirm" disabled>确认提交</button></footer></form>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event => { if (event.target.closest('[data-publish-close]')) { dialog.close(); publishContext = null; } });
    dialog.addEventListener('change',() => { $('graphPublishConfirm').disabled = ![...dialog.querySelectorAll('input[type=checkbox]')].every(input => input.checked); });
    $('graphPublishForm').addEventListener('submit',confirmSubmit);
  }
  function init() {
    if (initialized) return; initialized = true;
    mountHistory(); mountPublish();
    $('qualityModule').addEventListener('click',event => {
      const button = event.target.closest('[data-application-action]'); if (!button) return;
      event.preventDefault(); event.stopPropagation();
      const id = button.dataset.applicationId, name = button.dataset.applicationAction;
      if (name === 'history') openHistory(id);
      if (name === 'submit') submit(id);
      if (name === 'toggle') toggle(id);
    });
    ['kg:quality-change','kg:results-change','kg:application-change'].forEach(name => document.addEventListener(name,render));
    render();
  }
  K.applicationUI = {init,render,controls,assessment,openHistory};
})();
