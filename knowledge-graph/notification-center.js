(function () {
  'use strict';

  const READ_KEY = 'xinghuo-graph-notifications-read-v1';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

  function init() {
    const source = window.KGNotifications;
    const triggers = [...document.querySelectorAll('[data-kg-notifications]')];
    if (!source || !Array.isArray(source.items) || !triggers.length) return;

    const items = [...source.items].sort((a, b) => String(b.time).localeCompare(String(a.time)));
    let readIds = new Set();
    try {
      const stored = JSON.parse(sessionStorage.getItem(READ_KEY) || '[]');
      if (Array.isArray(stored)) readIds = new Set(stored.filter(id => typeof id === 'string'));
    } catch (_) { /* 消息列表在浏览器不允许保存时仍然可用。 */ }
    let activeTrigger = triggers.find(trigger => trigger.getClientRects().length) || triggers[0];
    let activeTab = 'messages';

    const panel = document.createElement('section');
    panel.id = 'kg-msg-center';
    panel.className = 'kg-msg-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '消息中心');
    panel.innerHTML = `
      <div class="kg-msg-header">
        <div class="kg-msg-tabs" role="tablist" aria-label="消息中心内容">
          <button type="button" class="kg-msg-tab" id="kg-msg-tab-messages" role="tab" aria-selected="true" aria-controls="kg-msg-messages" data-kg-msg-tab="messages">消息通知<span class="kg-msg-tab-dot" aria-hidden="true"></span></button>
          <button type="button" class="kg-msg-tab" id="kg-msg-tab-uploads" role="tab" aria-selected="false" aria-controls="kg-msg-uploads" tabindex="-1" data-kg-msg-tab="uploads">上传文件</button>
        </div>
        <button type="button" class="kg-msg-read-all" data-kg-msg-read-all><span aria-hidden="true">✓</span> 全部已读</button>
        <button type="button" class="kg-msg-close" aria-label="关闭消息中心" data-kg-msg-close>×</button>
      </div>
      <div class="kg-msg-content" id="kg-msg-messages" role="tabpanel" aria-labelledby="kg-msg-tab-messages" tabindex="0">
        <ul class="kg-msg-list"></ul>
      </div>
      <div class="kg-msg-content" id="kg-msg-uploads" role="tabpanel" aria-labelledby="kg-msg-tab-uploads" tabindex="0" hidden>
        <div class="kg-msg-empty"><span class="kg-msg-empty-icon" aria-hidden="true">⇧</span><strong>暂无上传记录</strong><p>上传文件后，可在这里查看处理进度。</p></div>
      </div>
      <span class="kg-msg-sr-only" role="status" aria-live="polite" data-kg-msg-live></span>`;
    document.body.appendChild(panel);

    function statusLabel(item) {
      if (item.statusLabel) return item.statusLabel;
      if (item.category === 'quality') return item.status === 'failed' ? '生成失败' : '已生成';
      return { approved: '已通过', rejected: '已驳回', completed: '已完成', failed: '已失败' }[item.status] || item.status;
    }

    function itemUrl(item) {
      try {
        const value = source.url(item);
        if (!value) return '';
        const url = new URL(value, location.href);
        return /^https?:$/.test(url.protocol) && url.origin === location.origin ? url.href : '';
      } catch (_) { return ''; }
    }

    const list = panel.querySelector('.kg-msg-list');
    list.innerHTML = items.map(item => {
      const href = itemUrl(item);
      const originalTitle = String(item.title || '');
      const prefix = `【${item.label || ''}】`;
      const title = originalTitle.startsWith(prefix) ? originalTitle.slice(prefix.length).trimStart() : originalTitle;
      const category = ['ontology-review', 'graph-review'].includes(item.category) ? 'review' : 'task';
      const status = ['approved', 'rejected', 'completed', 'failed'].includes(item.status) ? item.status : 'completed';
      return `<li class="kg-msg-item" data-kg-msg-id="${esc(item.id)}">
        <span class="kg-msg-item-dot" aria-label="未读"></span>
        <div class="kg-msg-item-body">
          <p class="kg-msg-title"><span class="kg-msg-category kg-msg-category-${category}">${esc(item.label)}</span> <span class="kg-msg-status kg-msg-status-${status}">${esc(statusLabel(item))}</span> ${esc(title)}</p>
          <div class="kg-msg-item-footer"><time datetime="${esc(String(item.time).replace(' ', 'T'))}">${esc(item.time)}</time>${href ? `<a class="kg-msg-view" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-kg-msg-view="${esc(item.id)}" aria-label="去查看：${esc(title)}">去查看 <span aria-hidden="true">↗</span></a>` : '<span class="kg-msg-unavailable">暂无法查看</span>'}</div>
        </div>
      </li>`;
    }).join('');
    if (!items.length) list.innerHTML = '<li class="kg-msg-empty"><strong>暂无消息</strong><p>审核结果与任务进展将显示在这里。</p></li>';

    triggers.forEach(trigger => {
      trigger.classList.add('kg-msg-trigger');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', panel.id);
      trigger.setAttribute('aria-expanded', 'false');
      const dot = document.createElement('span');
      dot.className = 'kg-msg-trigger-dot';
      dot.setAttribute('aria-hidden', 'true');
      trigger.appendChild(dot);
    });

    function syncReadState(announce) {
      const unread = items.filter(item => !readIds.has(String(item.id))).length;
      triggers.forEach(trigger => {
        trigger.querySelector('.kg-msg-trigger-dot').hidden = unread === 0;
        trigger.setAttribute('aria-label', unread ? `消息中心，${unread} 条未读` : '消息中心，全部已读');
      });
      panel.querySelector('.kg-msg-tab-dot').hidden = unread === 0;
      panel.querySelector('[data-kg-msg-read-all]').disabled = unread === 0;
      panel.querySelectorAll('[data-kg-msg-id]').forEach(row => {
        const read = readIds.has(row.dataset.kgMsgId);
        row.classList.toggle('kg-msg-is-read', read);
        row.querySelector('.kg-msg-item-dot').hidden = read;
      });
      if (announce) panel.querySelector('[data-kg-msg-live]').textContent = unread ? `还有 ${unread} 条未读消息` : '全部消息已读';
    }

    function saveReadState() {
      try { sessionStorage.setItem(READ_KEY, JSON.stringify([...readIds])); } catch (_) { /* 保留本次页面内的已读状态。 */ }
      syncReadState(true);
    }

    function selectTab(tab, moveFocus) {
      activeTab = tab;
      panel.querySelectorAll('[data-kg-msg-tab]').forEach(button => {
        const selected = button.dataset.kgMsgTab === tab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected && moveFocus) button.focus();
      });
      panel.querySelector('#kg-msg-messages').hidden = tab !== 'messages';
      panel.querySelector('#kg-msg-uploads').hidden = tab !== 'uploads';
      panel.querySelector('[data-kg-msg-read-all]').hidden = tab !== 'messages';
    }

    function positionPanel() {
      if (panel.hidden) return;
      if (!activeTrigger.getClientRects().length) {
        close(false);
        return;
      }
      const rect = activeTrigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const top = Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 240));
      panel.style.left = `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(160, window.innerHeight - top - 12)}px`;
    }

    function open(trigger) {
      activeTrigger = trigger;
      panel.hidden = false;
      triggers.forEach(button => button.setAttribute('aria-expanded', String(button === trigger)));
      positionPanel();
      selectTab(activeTab, true);
    }

    function close(restoreFocus) {
      if (panel.hidden) return;
      panel.hidden = true;
      triggers.forEach(button => button.setAttribute('aria-expanded', 'false'));
      if (restoreFocus) activeTrigger.focus({ preventScroll: true });
    }

    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-kg-notifications]');
      if (trigger && triggers.includes(trigger)) {
        if (!panel.hidden && activeTrigger === trigger) close(true);
        else open(trigger);
        return;
      }
      if (!panel.hidden && !panel.contains(event.target)) close(false);
    });

    panel.addEventListener('click', event => {
      const tab = event.target.closest('[data-kg-msg-tab]');
      if (tab) selectTab(tab.dataset.kgMsgTab, false);
      if (event.target.closest('[data-kg-msg-close]')) close(true);
      if (event.target.closest('[data-kg-msg-read-all]')) {
        items.forEach(item => readIds.add(String(item.id)));
        saveReadState();
      }
      const link = event.target.closest('[data-kg-msg-view]');
      if (link) {
        readIds.add(link.dataset.kgMsgView);
        saveReadState();
        // 不拦截链接，由浏览器正常打开新的页面。
      }
    });

    panel.addEventListener('keydown', event => {
      const tab = event.target.closest('[data-kg-msg-tab]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'messages' : event.key === 'End' ? 'uploads' : activeTab === 'messages' ? 'uploads' : 'messages';
      selectTab(next, true);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        close(true);
      }
    });
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    window.addEventListener('hashchange', () => requestAnimationFrame(positionPanel));
    syncReadState(false);
    if (new URLSearchParams(location.search).get('messages') === 'open') {
      requestAnimationFrame(() => open(triggers.find(trigger => trigger.getClientRects().length) || activeTrigger));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
