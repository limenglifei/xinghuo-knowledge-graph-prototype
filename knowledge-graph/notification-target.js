/* 通知落地只导航、查看任务及审核历史。样例初始化与 notice 参数无关，且不会覆盖已有操作。 */
(() => {
  const K = window.KG,N = window.KGNotifications;
  if (!K || !N) return;
  const $ = K.$,esc = K.escape;

  // 两条审核结论作为通用页面样例初始化；并非由“去查看”触发提交或审核。
  N.items.filter(item => item.category === 'graph-review').forEach(item => {
    K.applications.seedReviewExample(item.target.ontologyId,{status:item.status,submitted:item.submitted,
      updated:item.time,remark:item.reason || item.remark});
  });
  K.graphCatalog.render();

  const id = new URL(location.href).searchParams.get('notice');
  const item = N.items.find(value => value.id === id);
  if (!item || !K.items.some(value => value.id === item.target.ontologyId)) return;
  const target = item.target;
  // 仅首次加载读取允许列表中的消息；之后切换页签不会被旧查询参数拉回。
  if (target.tab === 'modeling') {
    if (K.currentId !== target.ontologyId) K.openOntology(target.ontologyId);
  } else if (K.pageTab !== target.tab || K.pageGraphId !== target.ontologyId || K.currentId) {
    K.navigateGraph(target.tab,target.ontologyId);
  }

  function emphasize(element) {
    if (!element) return;
    element.setAttribute('data-notification-match',item.id);
    element.style.borderColor = '#9bb5ff';
    element.style.backgroundColor = '#f7f9ff';
    element.scrollIntoView({block:'nearest'});
  }
  function contextNote(text) {
    const header = $(target.tab + 'DetailHeader');
    if (!header) return;
    const note = document.createElement('section');
    note.id = 'notificationContext';
    note.setAttribute('role','status');
    note.style.cssText = 'margin:0 0 20px;padding:14px 18px;border:1px solid #d9e4ff;border-radius:8px;background:#f7f9ff;color:#536581;font-size:13px;line-height:1.7';
    note.innerHTML = '<strong style="display:block;color:' + (item.status === 'failed' ? '#cf544a' : '#34435f') + '">' + esc(item.title) +
      '</strong><div>' + esc(text) + '</div><small>通知时间：' + esc(item.time) + '</small>';
    header.after(note);
    const inContext = () => !K.currentId && K.pageTab === target.tab && K.pageGraphId === target.ontologyId;
    // 页面页签采用内部路由，监听当前详情头是否可见即可避免跨本体保留提示。
    const observer = new MutationObserver(() => { const hidden = !inContext(); if (note.hidden !== hidden) note.hidden = hidden; });
    observer.observe($(target.tab + 'DetailView'),{attributes:true,subtree:true,childList:true});
  }
  function failureDetail() {
    contextNote(item.reason + ' 下方展示当前本体数据，与本次失败记录分别查看。');
    const dialog = document.createElement('dialog');
    dialog.id = 'notificationEventDialog';dialog.className = 'publish-dialog';
    dialog.setAttribute('aria-labelledby','notificationEventTitle');
    const kind = item.category === 'quality' ? '质检失败详情' : '融合任务失败详情';
    const summary = item.category === 'quality' ? '质检报告 V' + item.reportVersion + '（未生成）' : item.taskName;
    dialog.innerHTML = '<div class="dialog-layout"><header class="dialog-header"><h2 id="notificationEventTitle">' + kind +
      '</h2><button class="close" data-notice-close aria-label="关闭失败详情">×</button></header><div class="dialog-body">' +
      '<dl class="publish-facts"><dt>所属本体</dt><dd>' + esc(item.name) + '</dd><dt>' + (item.category === 'quality' ? '报告版本' : '任务名称') +
      '</dt><dd>' + esc(summary) + '</dd><dt>处理状态</dt><dd><span class="status rejected">' + (item.category === 'quality' ? '生成失败' : '失败') +
      '</span></dd><dt>通知时间</dt><dd>' + esc(item.time) + '</dd><dt>失败原因</dt><dd>' + esc(item.reason) + '</dd></dl>' +
      '<p class="notice">这是本次失败尝试的记录，未产生成功结果，也不会覆盖现有数据或报告。</p></div><footer class="dialog-footer">' +
      '<button class="btn" data-notice-close>查看当前本体</button><button class="btn primary" id="notificationRetry">' +
      (item.category === 'quality' ? '重新发起质检' : '重新创建融合任务') + '</button></footer></div>';
    document.body.append(dialog);
    dialog.addEventListener('click',event => { if (event.target.closest('[data-notice-close]')) dialog.close(); });
    $('notificationRetry').addEventListener('click',() => {
      dialog.close();
      if (item.category === 'quality') K.qualityUI.openCreate(target.ontologyId);
      else K.fusionTasks.open(target.ontologyId);
    });
    dialog.showModal();
  }

  if (item.category === 'ontology-review') {
    K.reviewUI.openHistory();
    const record = K.item().history.find(record => record.status === target.reviewStatus);
    if (record) emphasize([...$('reviewHistory').children].find(element => element.dataset.reviewId === record.id));
  } else if (item.category === 'graph-review') {
    K.applicationUI.openHistory(target.ontologyId);
    const record = K.applications.get(target.ontologyId)?.history.find(record => record.status === target.reviewStatus);
    if (record) emphasize([...$('applicationHistoryRecords').children].find(element => element.dataset.applicationRecord === record.id));
  } else if (target.eventOnly) {
    failureDetail();
  } else if (item.category === 'extraction') {
    const task = K.extract.tasks.find(task => task.ontologyId === target.ontologyId && task.name === target.taskName);
    if (task) {
      contextNote(item.status === 'failed' ? item.reason : '已定位到对应抽取任务，可查看处理进度、抽取范围与结果。');
      K.extractionUI.openDetail(task.id);
      $('extractionTaskDialog').setAttribute('data-notification-match',item.id);
    }
  } else if (item.category === 'fusion') {
    const task = K.fusionTasks.tasks.find(task => task.ontologyId === target.ontologyId && task.name === target.taskName);
    if (task) {
      contextNote('已定位到对应融合任务，可查看自动处理和人工审核结果。');
      K.fusionTasks.openDetail(task.id);
      $('fusionTaskDetail').setAttribute('data-notification-match',item.id);
    }
  } else if (item.category === 'quality') {
    K.qualityUI.viewHistory(target.reportVersion);
    contextNote('已定位到质检报告 V' + target.reportVersion + '。该历史报告只读，可通过“查看最新报告”返回当前版本。');
    $('qualityPanel').setAttribute('data-notification-match',item.id);
  }
})();
