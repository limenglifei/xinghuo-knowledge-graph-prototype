/* AI 辅助使用本地示例建议；确认加入前，建议不改变工作草稿。 */
(() => {
  'use strict';
  const K = window.KG;
  const $ = K.$;
  const state = { initialized:false, timer:null, token:0, busy:false, ownerId:null, suggestion:null, generatedSource:'' };

  function setError(message = '') {
    $('aiError').textContent = message;
    $('aiError').hidden = !message;
  }

  /** 定时回调与本次打开会话绑定，关闭或切换对象后不得写回迟到结果。 */
  function cancelGeneration() {
    state.token += 1;
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.timer = null;
    setBusy(false);
  }

  function setBusy(busy) {
    state.busy = busy;
    $('aiLoading').hidden = !busy;
    $('aiDialog').setAttribute('aria-busy', String(busy));
    $('generateAI').disabled = busy;
    $('applyAI').disabled = busy;
    $('generateAI').textContent = busy ? '正在生成…' : state.suggestion ? '重新生成' : '生成建议';
  }

  /** 描述修改后旧建议失效，避免用户把与当前描述不符的结果直接加入。 */
  function clearSuggestion() {
    state.suggestion = null;
    state.generatedSource = '';
    $('aiResult').hidden = true;
    $('aiResultContent').replaceChildren();
    $('applyAI').hidden = true;
    $('generateAI').classList.add('primary');
    $('generateAI').textContent = state.busy ? '正在生成…' : '生成建议';
    setError();
  }

  /** 直接读取草稿基本信息，用户无需再次输入；签名分别保留名称和描述边界。 */
  function currentSource() {
    const name = String(K.draft?.name || '').trim();
    const description = String(K.draft?.description || '').trim();
    return { name, description, prompt:[name, description].filter(Boolean).join('：'), signature:JSON.stringify([name, description]) };
  }

  function renderSource(source) {
    $('aiSourceName').textContent = source.name || '未填写本体名称';
    $('aiSourceDescription').textContent = source.description || '未填写描述，将根据本体名称生成建议';
  }

  function close() {
    cancelGeneration();
    clearSuggestion();
    if ($('aiDialog').open) $('aiDialog').close();
  }

  /** 可由新建本体流程调用；只在当前本体允许编辑时打开。 */
  function open() {
    if (!K.draft) return;
    if (K.locked()) { K.notify('当前本体正在审核，请撤回后再编辑。'); return; }
    cancelGeneration();
    clearSuggestion();
    state.ownerId = K.currentId;
    renderSource(currentSource());
    if (!$('aiDialog').open) $('aiDialog').showModal();
    generate();
    $('cancelAI').focus();
  }

  function canEdit() {
    return Boolean(K.draft && state.ownerId === K.currentId && !K.locked());
  }

  function generate() {
    if (state.busy || !$('aiDialog').open) return;
    if (!canEdit()) { setError('当前本体暂时不能编辑，请关闭后重新进入。'); return; }
    const source = currentSource();
    clearSuggestion();
    renderSource(source);
    if (!source.name) {
      setError('请返回基本信息补充本体名称，再使用 AI 辅助构建。');
      return;
    }
    const token = ++state.token;
    setBusy(true);
    // 固定短延迟仅演示等待状态，不代表真实服务进度或实际模型调用。
    state.timer = window.setTimeout(() => finishGeneration({ token, source }), 700);
  }

  function finishGeneration(request) {
    if (request.token !== state.token || !$('aiDialog').open) return;
    state.timer = null;
    setBusy(false);
    if (!canEdit()) { setError('当前本体状态已变化，请关闭后重新进入。'); return; }
    if (currentSource().signature !== request.source.signature) {
      renderSource(currentSource());
      setError('本体名称或描述已更新，请重新生成建议。');
      return;
    }
    try {
      state.suggestion = K.suggest(request.source.prompt);
      state.generatedSource = request.source.signature;
      renderSuggestion();
    } catch (error) {
      clearSuggestion();
      setError('暂时无法生成建议，草稿未改变。请重试。');
      $('generateAI').textContent = '重试生成';
    }
  }

  function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function entitySuggestions(entities) {
    const section = document.createElement('section');
    section.className = 'ai-suggestion-section';
    section.append(textElement('h4', `实体类型（${entities.length}）`));
    const list = document.createElement('div');
    list.className = 'ai-suggestion-entities';
    entities.forEach(entity => {
      const row = document.createElement('div');
      row.className = 'ai-suggestion-entity';
      row.append(textElement('strong', entity.name), textElement('span', `${entity.properties.length} 个属性`, 'help'));
      row.title = entity.properties.map(property => property.name).join('、') || '暂无属性';
      list.append(row);
    });
    section.append(list);
    return section;
  }

  function relationSuggestions(suggestion) {
    const section = document.createElement('section');
    section.className = 'ai-suggestion-section';
    section.append(textElement('h4', `关系（${suggestion.relations.length}）`));
    const names = new Map(suggestion.entities.map(entity => [entity.id, entity.name]));
    suggestion.relations.forEach(relation => {
      const description = `${names.get(relation.from) || '未指定'} → ${relation.name} → ${names.get(relation.to) || '未指定'}`;
      section.append(textElement('p', description, 'ai-suggestion-relation'));
    });
    return section;
  }

  function renderSuggestion() {
    const suggestion = state.suggestion;
    $('aiResultTitle').textContent = `建议方案 · ${suggestion.label}`;
    $('aiResultContent').replaceChildren(entitySuggestions(suggestion.entities), relationSuggestions(suggestion));
    $('aiResult').hidden = false;
    $('applyAI').hidden = false;
    $('applyAI').disabled = false;
    $('generateAI').classList.remove('primary');
    $('generateAI').textContent = '重新生成';
    $('aiResult').setAttribute('role', 'status');
  }

  /** 仅显式确认时合并；保留已有内容，并由编辑器呈现为待保存草稿。 */
  function apply() {
    if (state.busy || !state.suggestion || !$('aiDialog').open) return;
    if (!canEdit()) { setError('当前本体正在审核或已切换，无法加入建议。'); return; }
    if (currentSource().signature !== state.generatedSource) {
      clearSuggestion();
      renderSource(currentSource());
      setError('本体名称或描述已更新，请重新生成建议。');
      return;
    }
    const { entityCount, relationCount } = K.mergeSuggestion(state.suggestion);
    K.previewMode = 'draft';
    K.editor.renderConfig();
    K.editor.changed();
    close();
    K.notify(entityCount || relationCount ? `已加入 ${entityCount} 个实体类型、${relationCount} 个关系，请检查后保存草稿。` : '建议内容已存在，保留了当前实体、关系与属性。');
  }

  /** 由页面统一初始化；幂等绑定，避免多次初始化引发重复生成。 */
  function init() {
    if (state.initialized) return;
    state.initialized = true;
    $('openAI').addEventListener('click', open);
    $('closeAI').addEventListener('click', close);
    $('cancelAI').addEventListener('click', close);
    $('generateAI').addEventListener('click', generate);
    $('applyAI').addEventListener('click', apply);
    $('aiDialog').addEventListener('cancel', event => { event.preventDefault(); close(); });
    $('aiDialog').addEventListener('close', () => { cancelGeneration(); clearSuggestion(); });
  }

  K.ai = Object.freeze({ init, open });
})();
