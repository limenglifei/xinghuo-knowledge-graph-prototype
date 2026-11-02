/* 首页普通问答的本地交互。每轮固定知识范围和引用，后续改选不改变历史回答。 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const evidence = window.QAEvidence;
  const libraries = [
    { id:'kb-rules', name:'公司制度相关资料文档', description:'员工手册、审批与管理制度', count:19, updated:'2026-09-20' },
    { id:'kb-finance', name:'财务制度与报销资料', description:'差旅流程、费用标准与票据要求', count:6, updated:'2026-09-18' },
    { id:'kb-medical', name:'生物医药知识库', description:'药品目录、类型与基础信息', count:9, updated:'2026-10-08' },
    { id:'kb-product', name:'产品资料库与手册', description:'产品说明、功能清单与操作指引', count:12, updated:'2026-09-26' },
    { id:'kb-property', name:'物业管理知识', description:'园区管理与服务流程', count:2, updated:'2026-09-15' },
    { id:'kb-example', name:'样例知识库', description:'知识检索示例资料', count:4, updated:'2026-09-12' },
  ];
  const files = [
    { id:'doc-drugs', kbId:'kb-medical', name:'药品目录.pdf', page:'第 4 页', quote:'目录分类：药品 ＞ 化学药 ＞ 抗菌药。阿莫西林胶囊归入抗菌药；布洛芬缓释胶囊当前登记为药品，尚未细分到子类型。', updated:'2026-10-08' },
    { id:'doc-travel', kbId:'kb-finance', name:'差旅报销管理办法.pdf', page:'第 6 页', quote:'报销前应完成出差审批；提交行程信息与有效票据，并按岗位及目的地核对适用标准。', updated:'2026-09-18' },
    { id:'doc-staff', kbId:'kb-rules', name:'员工手册.pdf', page:'第 12 页', quote:'请假申请需填写时间和事由，提交直属负责人审批；审批后同步考勤记录。', updated:'2026-09-20' },
    { id:'doc-product', kbId:'kb-product', name:'产品操作手册.pdf', page:'第 8 页', quote:'知识库支持资料上传、检索和问答；使用者仅可查看具有访问权限的资料。', updated:'2026-09-26' },
  ];
  // 弹窗内使用独立草稿；取消、关闭和 Esc 均不影响已确认范围。
  let selection = { kb:['kb-rules','kb-finance'], docs:[], graphs:[] };
  let draft = null;
  let activeTab = 'kb';
  let activeTurn = null;
  let timer = null;
  let toastTimer = null;
  let sequence = 0;
  const turns = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const labels = { kb:'知识库', docs:'文档', graphs:'知识图谱' };
  const catalog = type => type === 'kb' ? libraries : type === 'docs' ? files : evidence.catalog;

  function selectionSummary(value) {
    const parts = Object.keys(labels).filter(key => value[key].length).map(key => value[key].length + ' 个' + labels[key]);
    return parts.length ? parts.join(' · ') : '未选择知识源';
  }

  function selectionNames(value) {
    return Object.keys(labels).flatMap(key => catalog(key).filter(item => value[key].includes(item.id)).map(item => item.name));
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $('qaToast').textContent = message;
    $('qaToast').hidden = false;
    toastTimer = setTimeout(() => { $('qaToast').hidden = true; }, 2400);
  }

  function syncSelection() {
    document.querySelectorAll('[data-qa-sources="kb"]').forEach(button => {
      button.textContent = '知识源：' + (selection.kb.length || selection.docs.length ? selectionSummary({ ...selection, graphs:[] }) : '未选择');
      button.title = selectionNames(selection).join('、');
    });
    document.querySelectorAll('[data-qa-sources="graphs"]').forEach(button => {
      button.textContent = '⬡ 知识图谱：' + (selection.graphs.length ? '已选 ' + selection.graphs.length + ' 个' : '未选择');
      button.title = evidence.catalog.filter(item => selection.graphs.includes(item.id)).map(item => item.name).join('、') || '选择知识图谱';
    });
  }

  function openSources(tab) {
    draft = clone(selection);
    activeTab = tab;
    $('qaSourceSearch').value = '';
    renderSourceList();
    $('qaSourceDialog').showModal();
  }

  function sourceCard(item) {
    const isGraph = activeTab === 'graphs';
    const disabled = isGraph && !item.available;
    const checked = draft[activeTab].includes(item.id);
    const description = isGraph ? item.description : activeTab === 'docs' ? libraries.find(lib => lib.id === item.kbId).name : item.description;
    const meta = isGraph ? item.entities + ' 个实体类型 · ' + item.relations + ' 个关系类型' : activeTab === 'kb' ? '共 ' + item.count + ' 个文件' : 'PDF 文档';
    return `<label class="qa-source-card ${checked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}">
      <span class="qa-source-symbol" aria-hidden="true">${isGraph ? '⬡' : '▤'}</span>
      <span class="qa-source-content"><span class="qa-source-top"><strong>${escape(item.name)}</strong><input type="checkbox" data-qa-source="${escape(item.id)}" aria-label="${escape(item.name)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}></span>
      <span class="qa-source-meta"><span>${escape(meta)}</span><span>${escape(item.updated)}</span></span><span class="qa-source-desc">${escape(description)}</span>
      ${isGraph ? `<span class="qa-source-state">${escape(item.statusLabel || (item.available ? '已发布' : '不可用'))}${item.available ? ' · v' + escape(item.version) : ''}</span>${disabled ? `<span class="qa-source-reason">${escape(item.unavailableReason || '发布并启用后可用于问答')}</span>` : ''}` : ''}</span></label>`;
  }

  function renderSourceList() {
    const search = $('qaSourceSearch').value.trim().toLowerCase();
    document.querySelectorAll('[data-qa-tab]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.qaTab === activeTab));
    });
    $('qaSourceList').setAttribute('aria-labelledby', { kb:'qaKbTab', docs:'qaDocsTab', graphs:'qaGraphsTab' }[activeTab]);
    $('qaSourceSearch').placeholder = '请输入' + labels[activeTab] + '名称';
    $('qaSourceHint').textContent = activeTab === 'graphs'
      ? '仅可选择已发布、已启用的知识图谱；可搭配知识库或文档，也可单独使用。'
      : '知识库与指定文档二选一，可搭配知识图谱一起使用。';
    const visible = catalog(activeTab).filter(item => (item.name + ' ' + (item.description || '')).toLowerCase().includes(search));
    $('qaSourceList').innerHTML = visible.length ? visible.map(sourceCard).join('') : '<div class="qa-source-empty">未找到匹配的' + labels[activeTab] + '<br><button class="btn text" data-qa-reset-search>清空搜索</button></div>';
    $('qaSelectionCount').textContent = '已选：' + selectionSummary(draft);
    $('qaClearSources').disabled = !Object.values(draft).some(values => values.length);
  }

  function changeSource(input) {
    const item = catalog(activeTab).find(row => row.id === input.dataset.qaSource);
    if (!item || (activeTab === 'graphs' && !item.available)) return;
    draft[activeTab] = draft[activeTab].filter(id => id !== item.id);
    if (input.checked) {
      draft[activeTab].push(item.id);
      if (activeTab === 'kb') draft.docs = [];
      if (activeTab === 'docs') draft.kb = [];
    }
    const scroll = $('qaSourceList').scrollTop;
    renderSourceList();
    $('qaSourceList').scrollTop = scroll;
    $('qaSourceList').querySelector('[data-qa-source="' + item.id + '"]')?.focus({ preventScroll:true });
  }

  function documentMatches(question, sourceSelection) {
    const available = files.filter(file => sourceSelection.docs.includes(file.id) || sourceSelection.kb.includes(file.kbId));
    return available.filter(file => {
      if (file.id === 'doc-drugs') return /阿莫西林|布洛芬/.test(question) && evidence.answer(question, ['medical']).matched;
      if (file.id === 'doc-travel') return /差旅|报销/.test(question);
      if (file.id === 'doc-staff') return /请假/.test(question);
      return /知识库/.test(question) && /功能|做什么|能力/.test(question);
    });
  }

  function makeTurn(question) {
    const sources = clone(selection);
    const result = evidence.answer(question, sources.graphs);
    return { id:'qa-turn-' + (++sequence), question, sources, result,
      documents:documentMatches(question, sources), stage:0, status:'running', attempt:0 };
  }

  function answerText(turn) {
    if (turn.result.matched) return turn.result.answerText;
    if (turn.documents.length) return turn.documents.map(file => '根据《' + file.name + '》：' + file.quote).join('\n\n');
    if (!selectionNames(turn.sources).length) return '本轮未选择知识源，无法给出有来源依据的回答。请选择知识库、文档或知识图谱后重新提问。';
    return '当前所选知识源中未找到足以回答该问题的依据。你可以补充实体名称、调整问题，或更换知识源后再试。';
  }

  function documentReferences(turn) {
    if (!turn.documents.length) return '';
    return `<h4>参考文件（${turn.documents.length}）</h4><div class="qa-file-list">${turn.documents.map(file =>
      `<button class="qa-file-reference" data-qa-file-detail="${file.id}"><span class="qa-source-symbol">▤</span><span>${escape(file.name)}<small>${escape(file.page)} · 查看引用片段</small></span></button>`).join('')}</div>`;
  }

  function references(turn) {
    const graphs = turn.result.matched ? evidence.renderReferences(turn.result) : '';
    const documents = documentReferences(turn);
    if (!graphs && !documents) return '';
    return '<section class="qa-reference-block"><h3>参考资料</h3>' + documents + graphs + '</section>';
  }

  function turnContent(turn) {
    const scope = selectionNames(turn.sources).join('、') || '未选择知识源';
    const process = turn.sources.graphs.length ? evidence.renderProcess(turn.result, turn.stage, turn.status) : '';
    let content = '<p class="qa-answer-status" role="status">正在检索所选知识源并整理回答…</p>';
    if (turn.status === 'completed') content = '<p class="qa-answer-text">' + escape(answerText(turn)) + '</p>' + references(turn);
    if (turn.status === 'stopped') content = '<p class="qa-answer-status">已停止回答，未完成的查询不会作为回答依据。</p>';
    if (turn.status === 'failed') content = '<p class="qa-answer-warning" role="alert">图谱查询暂时不可用，尚未生成回答。你可以重试，或调整知识源后重新提问。</p>';
    const actions = turn.status !== 'running' ? `<div class="qa-answer-actions"><button data-qa-retry>↻ ${turn.status === 'completed' ? '重新生成' : '重新回答'}</button>${turn.status === 'completed' ? '<button data-qa-copy>复制回答</button>' : ''}</div>` : '';
    return `<div class="qa-question">${escape(turn.question)}</div><div class="qa-turn-scope">本轮知识源：${escape(scope)}</div>
      <div class="qa-answer-heading"><span class="qa-answer-logo">✦</span>星火知识库</div>
      <div class="qa-answer-content">${process}${content}${actions}</div>`;
  }

  function renderTurn(turn) {
    let container = $(turn.id);
    if (!container) {
      container = document.createElement('article');
      container.className = 'qa-turn';
      container.id = turn.id;
      $('qaConversation').append(container);
    }
    container.innerHTML = turnContent(turn);
    container.dataset.status = turn.status;
  }

  function updateComposer() {
    const busy = !!activeTurn;
    $('qaStop').hidden = !busy;
    $('qaFollowSend').hidden = busy;
    $('qaFollowQuestion').disabled = busy;
    $('qaHomeSend').disabled = busy;
    document.querySelectorAll('[data-qa-sources]').forEach(button => { button.disabled = busy; });
    $('qaComposerNote').textContent = busy ? '正在生成回答，你可以随时停止' : '请结合来源核实回答内容';
  }

  function completeTurn(turn, status) {
    clearTimeout(timer);
    turn.status = status;
    renderTurn(turn);
    if (activeTurn === turn) activeTurn = null;
    updateComposer();
  }

  function advanceTurn(turn) {
    if (activeTurn !== turn || turn.status !== 'running') return;
    // 时间推进仅表达本地示例状态；不读取真实服务或模型的内部推理。
    const failFixture = new URLSearchParams(location.search).get('qa-preview') === 'error';
    if (failFixture && turn.sources.graphs.length && turn.stage === 1 && turn.attempt === 0) {
      completeTurn(turn, 'failed');
      return;
    }
    if (turn.stage >= 3) {
      completeTurn(turn, 'completed');
      return;
    }
    turn.stage += 1;
    renderTurn(turn);
    timer = setTimeout(() => advanceTurn(turn), 1800);
  }

  function beginTurn(turn) {
    activeTurn = turn;
    turn.stage = 0;
    turn.status = 'running';
    renderTurn(turn);
    updateComposer();
    timer = setTimeout(() => advanceTurn(turn), 1800);
  }

  function sendQuestion(input) {
    if (activeTurn) return;
    const question = input.value.trim();
    if (!question) {
      $('qaHomeError').textContent = '请先输入问题';
      notify('请先输入问题');
      input.focus();
      return;
    }
    $('qaHomeError').textContent = '';
    const turn = makeTurn(question);
    turns.push(turn);
    input.value = '';
    switchView('qa-chat');
    history.replaceState(null, '', location.pathname + location.search + '#qa-chat');
    beginTurn(turn);
    $(turn.id).scrollIntoView({ block:'start', behavior:'smooth' });
  }

  function showExample(question) {
    if (activeTurn) return notify('请先停止当前回答');
    selection = { kb:['kb-medical'], docs:[], graphs:['medical'] };
    syncSelection();
    $('qaHomeQuestion').value = question;
    $('qaHomeQuestion').focus();
    notify('已选择生物医药知识库和图谱，点击发送即可提问');
  }

  function openEvidence(turn, target) {
    const graph = turn.result.graphs.find(item => item.id === target.dataset.qaGraphDetail);
    const file = turn.documents.find(item => item.id === target.dataset.qaFileDetail);
    if (!graph && !file) return;
    $('qaEvidenceTitle').textContent = graph ? '参考知识图谱' : '参考文件';
    $('qaEvidenceBody').innerHTML = graph ? evidence.renderDetail(graph) :
      `<h3>${escape(file.name)}</h3><p class="qa-detail-meta">${escape(file.page)} · ${escape(libraries.find(item => item.id === file.kbId).name)}</p><blockquote>${escape(file.quote)}</blockquote><p class="qa-detail-meta">以上为本次回答引用的文档片段。</p>`;
    $('qaEvidenceDialog').showModal();
  }

  async function turnAction(event) {
    const article = event.target.closest('.qa-turn');
    const turn = turns.find(item => item.id === article?.id);
    if (!turn) return;
    const detail = event.target.closest('[data-qa-graph-detail], [data-qa-file-detail]');
    if (detail) return openEvidence(turn, detail);
    if (event.target.closest('[data-qa-retry]')) {
      if (activeTurn) return notify('请先停止当前回答');
      turn.attempt += 1;
      beginTurn(turn);
    }
    if (event.target.closest('[data-qa-copy]')) {
      try { await navigator.clipboard.writeText(answerText(turn)); notify('已复制回答'); }
      catch { notify('未能复制，请选择回答内容后手动复制'); }
    }
  }

  function bindSourceEvents() {
    document.querySelectorAll('[data-qa-sources]').forEach(button => button.addEventListener('click', () => openSources(button.dataset.qaSources)));
    document.querySelectorAll('[data-qa-tab]').forEach(button => button.addEventListener('click', () => {
      activeTab = button.dataset.qaTab;
      $('qaSourceSearch').value = '';
      renderSourceList();
    }));
    $('qaSourceSearch').addEventListener('input', renderSourceList);
    $('qaSourceList').addEventListener('change', event => {
      if (event.target.matches('[data-qa-source]')) changeSource(event.target);
    });
    $('qaSourceList').addEventListener('click', event => {
      if (!event.target.closest('[data-qa-reset-search]')) return;
      $('qaSourceSearch').value = '';
      renderSourceList();
    });
    $('qaClearSources').addEventListener('click', () => {
      draft = { kb:[], docs:[], graphs:[] };
      renderSourceList();
    });
    $('qaConfirmSources').addEventListener('click', () => {
      selection = clone(draft);
      syncSelection();
      $('qaSourceDialog').close();
    });
  }

  function bindConversationEvents() {
    // 返回首页菜单时恢复当前问答；只有“新建问答”会清空当前内容。
    document.querySelector('.nav-btn[data-view="home"]').addEventListener('click', () => {
      if (!turns.length) return;
      switchView('qa-chat');
      history.replaceState(null, '', location.pathname + location.search + '#qa-chat');
    });
    $('qaHomeSend').addEventListener('click', () => sendQuestion($('qaHomeQuestion')));
    $('qaFollowSend').addEventListener('click', () => sendQuestion($('qaFollowQuestion')));
    ['qaHomeQuestion','qaFollowQuestion'].forEach(id => $(id).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendQuestion($(id));
      }
    }));
    $('qaStop').addEventListener('click', () => { if (activeTurn) completeTurn(activeTurn, 'stopped'); });
    $('qaNewChat').addEventListener('click', () => {
      if (activeTurn) completeTurn(activeTurn, 'stopped');
      turns.length = 0;
      $('qaConversation').replaceChildren();
      $('qaFollowQuestion').value = '';
      $('qaHomeQuestion').value = '';
      switchView('home');
      history.replaceState(null, '', location.pathname + location.search + '#home');
      $('qaHomeQuestion').focus();
    });
    document.querySelectorAll('[data-qa-example]').forEach(button => button.addEventListener('click', () => showExample(button.dataset.qaExample)));
    $('qaConversation').addEventListener('click', turnAction);
  }

  /** 只移动既有入口，保留首页的视图切换与当前问答绑定。 */
  function syncPrimaryNavigation() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;
    nav.setAttribute('aria-label', '主导航');
    nav.insertAdjacentHTML('beforeend','<a class="nav-btn" href="knowledge-graph/index.html#tab=terms" title="术语库"><span class="nav-icon">▤</span><span>术语库</span></a>');
    const entries = [
      ['[data-view="home"]', '首页'],
      ['[data-view="records"]', '历史问答'],
      ['[data-view="knowledge"]', '知识库'],
      ['[href="knowledge-graph/index.html#tab=terms"]', '术语库'],
      ['[href="knowledge-graph/index.html"]', '知识图谱'],
      ['[data-view="workflow"]', '工作流'],
      ['[data-view="assistant-chat"]', '智能体'],
      ['[data-view="assistants"]', '场景助手'],
    ];
    entries.forEach(([selector, label]) => {
      const item = nav.querySelector(selector);
      if (!item) return;
      item.querySelector('span:last-child').textContent = label;
      item.title = label;
      nav.append(item);
    });
  }
  syncPrimaryNavigation();
  bindSourceEvents();
  bindConversationEvents();
  document.querySelectorAll('[data-qa-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.qaClose).close()));
  syncSelection();
  updateComposer();
  // 刷新后没有会话快照时回到输入页，避免展示一个没有上下文的空白会话。
  if (location.hash === '#qa-chat') {
    switchView('home');
    history.replaceState(null, '', location.pathname + location.search + '#home');
  }
})();
