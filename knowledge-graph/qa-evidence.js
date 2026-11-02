/* 普通问答的图谱证据样例：无接口、持久化、计时器或自主事件；会话状态由首页维护。 */
window.QAEvidence = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const catalog = [
    {id:'medical',name:'生物医药',description:'梳理药品、人群与疾病之间的关系，支持分类与层级查询。',version:1,entities:6,relations:2,updated:'2026-10-08 10:30',status:'published',statusLabel:'已发布',available:true,unavailableReason:''},
    {id:'organization',name:'企业组织',description:'连接企业、部门与人员，呈现组织架构和人员任职关系。',version:0,entities:3,relations:2,updated:'2026-10-08 10:30',status:'draft',statusLabel:'草稿',available:false,unavailableReason:'本体尚未发布，暂不可用于问答。'},
    {id:'policy',name:'政策服务',description:'关联政策、企业与申报条件，支持政策检索与条件分析。',version:0,entities:3,relations:2,updated:'2026-10-08 10:30',status:'reviewing',statusLabel:'审核中',available:false,unavailableReason:'本体正在审核，通过并发布后方可选择。'},
    {id:'research',name:'科研项目',description:'围绕项目、研究人员和科研成果，梳理协作与产出。',version:0,entities:3,relations:2,updated:'2026-10-08 10:30',status:'rejected',statusLabel:'已驳回',available:false,unavailableReason:'本体未通过审核，请调整并重新发布。'},
    {id:'product',name:'产品知识',description:'整理产品、功能与使用场景，为产品咨询提供支持。',version:1,entities:3,relations:2,updated:'2026-10-08 10:30',status:'disabled',statusLabel:'已禁用',available:false,unavailableReason:'已发布版本已禁用，启用后方可选择。'},
    {id:'service',name:'客户服务',description:'整理客户问题与解决方案，沉淀服务知识。',version:0,entities:0,relations:0,updated:'2026-10-08 10:30',status:'draft',statusLabel:'草稿',available:false,unavailableReason:'本体尚未完成结构定义与发布，暂不可用于问答。'}
  ].map(item => Object.freeze(item));
  Object.freeze(catalog);
  const ontologySource = {kind:'ontology',title:'生物医药本体定义 · v1',page:null,quote:'结构定义（示例）：药品下设化学药、生物制品；化学药下设抗菌药。子类型继承父类型的属性。'};
  const amoxicillin = {
    entities:[{name:'阿莫西林胶囊',type:'抗菌药'},{name:'抗菌药',type:'实体类型'},{name:'化学药',type:'实体类型'},{name:'药品',type:'实体类型'}],
    paths:[{nodes:['阿莫西林胶囊','抗菌药','化学药','药品'],relations:['实例属于','子类型属于','子类型属于']}],
    sources:[{kind:'document',title:'常用药品说明书汇编',page:3,quote:'资料摘录（示例）：阿莫西林胶囊；名称：阿莫西林胶囊，生产企业：华安制药。'},{kind:'ontology',title:'生物医药图谱 · 实例分类记录',page:null,quote:'已审核实例（示例）：阿莫西林胶囊，所属类型为抗菌药。该分类记录已通过人工审核。'},ontologySource],
    summary:'实例记录归入“抗菌药”；本体层级为“药品 → 化学药 → 抗菌药”。',
    answerText:'在当前“生物医药”图谱中，阿莫西林胶囊属于“抗菌药”。其类型层级为：药品 → 化学药 → 抗菌药。\n\n“抗菌药”继承“化学药”和“药品”的属性。这是当前图谱的分类结果，不涉及用药建议。'
  };
  const ibuprofen = {
    entities:[{name:'布洛芬缓释胶囊',type:'药品'},{name:'药品',type:'实体类型'}],
    paths:[{nodes:['布洛芬缓释胶囊','药品'],relations:['实例属于']}],
    sources:[{kind:'document',title:'常用药品说明书汇编',page:7,quote:'资料摘录（示例）：布洛芬缓释胶囊；名称：布洛芬缓释胶囊，剂型：胶囊。'},{kind:'ontology',title:'生物医药图谱 · 实例分类记录',page:null,quote:'已审核实例（示例）：布洛芬缓释胶囊，所属类型为药品；尚未细分到子类型。'}],
    summary:'当前已审核记录直接归类为“药品”，未继续细分到子类型。',
    answerText:'在当前“生物医药”图谱中，布洛芬缓释胶囊直接归类为“药品”。当前记录尚未细分到子类型，不能仅凭本次图谱记录补充更细的分类。'
  };
  const drugTypes = {
    entities:[{name:'药品',type:'实体类型'},{name:'化学药',type:'实体类型'},{name:'生物制品',type:'实体类型'},{name:'抗菌药',type:'实体类型'}],
    paths:[{nodes:['药品','化学药','抗菌药'],relations:['包含子类型','包含子类型']},{nodes:['药品','生物制品'],relations:['包含子类型']}],
    sources:[ontologySource],summary:'“药品”的直接子类型为“化学药”和“生物制品”；“抗菌药”是“化学药”的子类型。',
    answerText:'当前“生物医药”本体中，“药品”有两个直接子类型：化学药、生物制品。\n\n其中，“化学药”下还有“抗菌药”，因此“抗菌药”是“药品”的下级类型，但不是直接子类型。子类型可以继承父类型属性。'
  };
  const steps = ['定位实体','查询关系','核对来源','整理答案'];
  const statusNames = {running:'查询中',completed:'已完成',stopped:'已停止',failed:'未完成'};

  function normalizedQuestion(question) {
    return String(question || '').normalize('NFKC').trim().replace(/[\s“”「」『』"'？?。.!！]/g,'').replace(/^(请问|请告诉我|帮我查一下|帮我查询|查询一下)/,'');
  }
  /** 只覆盖明确支持的分类句式；附带临床问题、其他实体或其他任务均不伪造图谱命中。 */
  function matchQuestion(question) {
    const query = normalizedQuestion(question);
    const typeQuestion = /^(阿莫西林胶囊|阿莫西林|布洛芬缓释胶囊|布洛芬)(属于(哪个|哪种|什么)(类型|分类)|的(类型|分类)(是什么|有哪些)|是什么类型|的类型层级(是什么|有哪些)|的分类层级(是什么|有哪些))$/;
    const match = query.match(typeQuestion);
    if (match) return match[1].startsWith('阿莫西林') ? amoxicillin : ibuprofen;
    if (/^药品(有(哪些|什么)子类型|的(直接)?子类型(有|是)?(哪些|什么)|有哪些下级类型|的类型层级是什么)$/.test(query)) return drugTypes;
    return null;
  }
  /** 返回当前选择范围内的证据快照。空选择、不可用图谱及不支持的问题都返回未命中。 */
  function answer(question,graphIds = []) {
    const ids = new Set(Array.isArray(graphIds) ? graphIds : []);
    const selected = catalog.filter(item => ids.has(item.id) && item.available);
    const example = selected.some(item => item.id === 'medical') ? matchQuestion(question) : null;
    if (!example) {
      const answerText = selected.length ? '所选知识图谱中没有找到足够的依据，暂时无法给出基于图谱的结论。可以尝试询问“阿莫西林胶囊属于哪个类型？”或调整知识来源。' : '本次没有可用的知识图谱来源。请选择已发布并启用的图谱后，再查询其中的知识。';
      return {matched:false,graphs:[],answerText};
    }
    const graph = catalog.find(item => item.id === 'medical');
    const {answerText,...evidence} = clone(example);
    return {matched:true,graphs:[{id:graph.id,name:graph.name,version:graph.version,...evidence}],answerText};
  }

  function graphList(result) {
    return Array.isArray(result?.graphs) ? result.graphs : [];
  }
  function entityMarkup(entities) {
    return `<div class="qa-evidence-entities">${(entities || []).map(entity => `<span><b>${escape(entity.name)}</b><small>${escape(entity.type)}</small></span>`).join('')}</div>`;
  }
  function pathMarkup(path) {
    const nodes = Array.isArray(path?.nodes) ? path.nodes : [];
    const relations = Array.isArray(path?.relations) ? path.relations : [];
    return `<div class="qa-evidence-path" aria-label="${escape(nodes.map((node,index) => node + (relations[index] ? '，' + relations[index] + '，' : '')).join(''))}">${nodes.map((node,index) => `<span class="qa-evidence-node">${escape(node)}</span>${index < nodes.length - 1 ? `<span class="qa-evidence-edge"><small>${escape(relations[index] || '关联')}</small><span aria-hidden="true">→</span></span>` : ''}`).join('')}</div>`;
  }
  function sourceMarkup(source,index) {
    const location = source.kind === 'ontology' ? '本体结构 / 实例记录' : source.page ? `第 ${escape(source.page)} 页` : '来源记录';
    return `<article class="qa-evidence-source"><div><strong>${index + 1}. ${escape(source.title)}</strong><span>${location}</span></div><blockquote>${escape(source.quote)}</blockquote></article>`;
  }
  function stepEvidence(result,index) {
    const graphs = graphList(result);
    if (!result?.matched || !graphs.length) return `<p class="qa-evidence-empty">${['没有找到与问题匹配的可引用实体。','未获得支持该问题的关系路径。','暂无可引用的图谱来源。','没有生成基于图谱的结论，可调整问题或知识来源。'][index]}</p>`;
    if (index === 0) return graphs.map(graph => `<p class="qa-evidence-note">${escape(graph.name)} · v${escape(graph.version)}</p>${entityMarkup(graph.entities)}`).join('');
    if (index === 1) return graphs.map(graph => (graph.paths || []).map(pathMarkup).join('')).join('');
    if (index === 2) return graphs.map(graph => `<div class="qa-evidence-sources">${(graph.sources || []).map(sourceMarkup).join('')}</div>`).join('');
    return `<p class="qa-evidence-note">已根据已展示的实体、关系路径与来源整理回答，可在下方查看答案和图谱引用。</p>`;
  }
  function stepMarkup(result,index,stage,status) {
    const done = status === 'completed' || index < stage;
    const current = status !== 'completed' && index === stage;
    const state = done ? 'done' : current ? status : 'pending';
    const label = done ? '完成' : current ? statusNames[status] : '待执行';
    return `<li class="qa-evidence-step ${state}"><div class="qa-evidence-step-heading"><span class="qa-evidence-step-mark" aria-hidden="true">${done ? '✓' : index + 1}</span><strong>${steps[index]}</strong><small>${label}</small></div>${done ? `<div class="qa-evidence-step-body">${stepEvidence(result,index)}</div>` : ''}</li>`;
  }
  /** stage 是当前步骤 0–3；未完成步骤不泄露后续结果，停止/失败只保留已完成证据。 */
  function renderProcess(result,stage = 0,status = 'running') {
    const state = Object.hasOwn(statusNames,status) ? status : 'failed';
    const current = Math.max(0,Math.min(3,Math.floor(Number(stage) || 0)));
    const count = graphList(result).length;
    const summary = state === 'completed' ? result?.matched ? `完成 · 命中 ${count} 个图谱` : '完成 · 未命中可用证据' : statusNames[state];
    const stopped = ['stopped','failed'].includes(state) ? `<p class="qa-evidence-interrupted">${state === 'stopped' ? '本次查询已停止。已展示的证据会保留，未完成部分不作为回答依据。' : '本次查询未完成。以下仅保留已完成的查询步骤，请重试后再使用结果。'}</p>` : '';
    return `<details class="qa-evidence-process qa-evidence-${state}" ${state !== 'completed' ? 'open' : ''}><summary><span>知识图谱推理过程</span><small>${escape(summary)}</small><b aria-hidden="true">⌄</b></summary><div class="qa-evidence-process-body"><p class="qa-evidence-caption">展示查询步骤和可核对的知识依据。</p><ol class="qa-evidence-steps">${steps.map((step,index) => stepMarkup(result,index,current,state)).join('')}</ol>${stopped}</div></details>`;
  }
  function relationCount(graph) {
    return (graph.paths || []).reduce((sum,path) => sum + (path.relations || []).length,0);
  }
  /** 引用按钮交由主页面处理，模块不自行打开对话框或改变会话状态。 */
  function renderReferences(result) {
    const graphs = graphList(result);
    if (!result?.matched || !graphs.length) return '';
    return `<section class="qa-evidence-references" aria-label="知识图谱引用"><h3>知识图谱引用 <span>${graphs.length}</span></h3>${graphs.map(graph => `<article class="qa-evidence-reference"><header><span class="qa-evidence-graph-mark" aria-hidden="true">图谱</span><strong>${escape(graph.name)}</strong><span class="qa-evidence-version">v${escape(graph.version)}</span><button type="button" class="qa-evidence-detail-button" data-qa-graph-detail="${escape(graph.id)}">查看详情</button></header><p>${escape(graph.summary)}</p><div class="qa-evidence-reference-meta"><span>命中实体 / 类型 ${graph.entities?.length || 0}</span><span>关系路径 ${relationCount(graph)} 条连接</span><span>来源 ${graph.sources?.length || 0} 条</span></div><div class="qa-evidence-paths">${(graph.paths || []).map(pathMarkup).join('')}</div></article>`).join('')}</section>`;
  }
  /** 接收 answer() 返回的单个图谱快照，供首页详情弹窗嵌入，不读取当前图谱管理草稿。 */
  function renderDetail(graph) {
    if (!graph || !Array.isArray(graph.entities) || !Array.isArray(graph.paths)) return '<p class="qa-evidence-empty">没有找到本次回答对应的图谱证据，请返回当前回答重新打开。</p>';
    return `<div class="qa-evidence-detail"><div class="qa-evidence-detail-overview"><strong>${escape(graph.name)}</strong><span class="qa-evidence-version">v${escape(graph.version)}</span><span>本次回答使用的图谱版本</span></div><p class="qa-evidence-note">${escape(graph.summary)}</p><section><h3>命中实体与类型</h3>${entityMarkup(graph.entities)}</section><section><h3>查询到的关系路径</h3><div class="qa-evidence-paths">${graph.paths.map(pathMarkup).join('')}</div></section><section><h3>来源与原文依据</h3><div class="qa-evidence-sources">${(graph.sources || []).map(sourceMarkup).join('')}</div></section><p class="qa-evidence-caption">以上为本次回答的证据快照；本体层级来源于发布定义，文档摘录用于核对实体记录。</p></div>`;
  }
  return {catalog,answer,renderProcess,renderReferences,renderDetail,escape};
})();
