/* 启动失败不得伪装成无数据；仅在本次页面初始化期间显示恢复入口。 */
(() => {
  const notice = document.getElementById('prototypeLoadNotice');
  let completed = false;

  function showFailure() {
    if (completed) return;
    notice.hidden = false;
    notice.setAttribute('role','alert');
    document.getElementById('prototypeLoadTitle').textContent = '页面内容未加载完整';
    document.getElementById('prototypeLoadHint').textContent = '这不代表没有本体或图谱案例。请重新加载页面；本页临时操作会恢复为初始示例。';
  }
  function handleError(event) {
    if (event.target === window || event.target?.tagName === 'SCRIPT') showFailure();
  }
  function complete() {
    completed = true;
    notice.hidden = true;
    window.removeEventListener('error',handleError,true);
    window.removeEventListener('unhandledrejection',showFailure);
  }

  const retry = new URL(location.href);
  retry.searchParams.set('revision','41');
  retry.searchParams.set('reload',String(Date.now()));
  document.getElementById('prototypeReload').href = retry.href;
  window.addEventListener('error',handleError,true);
  window.addEventListener('unhandledrejection',showFailure);
  document.addEventListener('DOMContentLoaded',() => { if (!completed) showFailure(); },{once:true});
  window.KGPrototypeLoad = {complete};
})();
