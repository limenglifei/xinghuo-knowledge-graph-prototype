/* 静态评审数据：仅在当前页面内存中生效，不访问真实 AI、审核或业务服务。 */
window.KG = (() => {
  let sequence = 300;
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = prefix => prefix + '-' + sequence++;
  const now = () => new Date().toLocaleString('sv-SE').slice(0,19);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const colors = ['#5b8ff9','#61bda8','#e6a23c','#8c8fd9','#db7c9b','#6e91a8'];
  const entity = (name = '', index = 0) => ({id:uid('entity'),name,parentId:'',color:colors[index % colors.length],properties:[]});
  const property = () => ({id:uid('property'),name:'',type:'文本',required:false,description:''});
  const snapshot = item => clone({name:item.name,description:item.description,entities:item.entities,relations:item.relations});
  const signature = item => JSON.stringify(snapshot(item));
  const labels = {draft:'草稿',reviewing:'审核中',published:'已发布',rejected:'已驳回',disabled:'已禁用'};
  const api = {clone,uid,now,escape,colors,entity,property,snapshot,signature,labels,$:id => document.getElementById(id),items:[],currentId:null,draft:null,savedSignature:'',selected:null,previewMode:'draft',filter:'all',keyword:''};

  /** 单父类型层级供编辑、抽取和预览共用；所有读取均基于传入的草稿或发布快照。 */
  function ancestors(config,id) {
    const result = [], visited = new Set([id]);
    let current = config.entities.find(item => item.id === id);
    while (current?.parentId && !visited.has(current.parentId)) {
      current = config.entities.find(item => item.id === current.parentId);
      if (!current) break;
      visited.add(current.id); result.push(current);
    }
    return result;
  }
  function children(config,id) { return config.entities.filter(item => item.parentId === id); }
  function descendants(config,id) {
    const result = [], visited = new Set([id]), pending = [...children(config,id)];
    while (pending.length) {
      const item = pending.shift();
      if (visited.has(item.id)) continue;
      visited.add(item.id); result.push(item); pending.push(...children(config,item.id));
    }
    return result;
  }
  function inherited(config,id) {
    return ancestors(config,id).reverse().flatMap(owner => owner.properties.map(value => ({...clone(value),fromId:owner.id,fromName:owner.name})));
  }
  function hierarchyPath(config,id) {
    const item = config.entities.find(value => value.id === id);
    return item ? [...ancestors(config,id).reverse(),item].map(value => value.name || '未命名类型').join(' / ') : '';
  }
  function hierarchyStructureError(config,item) {
    const visited = new Set([item.id]);
    let current = item;
    while (current.parentId) {
      if (visited.has(current.parentId)) return '父子类型不能形成循环，请重新选择父类型。';
      current = config.entities.find(value => value.id === current.parentId);
      if (!current) return '父类型已不存在，请重新选择父类型。';
      visited.add(current.id);
    }
    return visited.size > 5 ? '实体类型最多支持 5 级，此调整会使子类型超过层级上限。' : '';
  }
  function hierarchyPropertyError(config,item) {
    const inheritedNames = new Set(inherited(config,item.id).map(value => value.name.trim().toLowerCase()));
    const conflict = item.properties.find(value => value.name.trim() && inheritedNames.has(value.name.trim().toLowerCase()));
    return conflict ? '“' + (item.name || '未命名类型') + '”的属性“' + conflict.name + '”与继承属性重名，请先调整本级属性。' : '';
  }
  function validateHierarchy(config) {
    for (const item of config.entities) {
      const message = hierarchyStructureError(config,item) || hierarchyPropertyError(config,item);
      if (message) return {message,tab:'entities',id:item.id};
    }
    return null;
  }
  /** 更换父类型校验整个分支，失败不改变原有父类型；返回可直接展示的错误文案。 */
  function changeParent(config,id,parentId) {
    const item = config.entities.find(value => value.id === id);
    if (!item) return '当前实体类型已不存在。';
    const previous = item.parentId || '';
    item.parentId = parentId || '';
    const error = validateHierarchy(config);
    if (error) item.parentId = previous;
    return error?.message || '';
  }
  api.hierarchy = {
    depth:(config,id) => config.entities.some(item => item.id === id) ? ancestors(config,id).length + 1 : 0,
    path:hierarchyPath, inherited,
    effective:(config,id) => [...inherited(config,id),...clone(config.entities.find(item => item.id === id)?.properties || [])],
    children, descendants, validate:validateHierarchy, changeParent
  };

  function sample(config) {
    const entities = config.entities.map((name,index) => entity(name,index));
    entities.forEach(value => { value.properties = [{...property(),name:'名称',required:true}]; });
    const relations = config.relations.map(([name,from,to]) => ({id:uid('relation'),name,from:entities[from].id,to:entities[to].id,properties:[]}));
    const item = {...config,entities,relations,history:[],live:null,created:'2026-10-08 10:30',updated:'2026-10-08 10:30'};
    if (config.stage === 'published') {
      item.live = {version:1,enabled:config.enabled !== false,config:snapshot(item)};
      item.history.push({id:uid('review'),type:'首次发布',status:'approved',version:1,submitted:'2026-10-07 09:30:00',updated:'2026-10-07 10:12:00',remark:'实体与关系定义清晰，审核通过。'});
    }
    if (['reviewing','rejected'].includes(config.stage)) {
      item.history.push({id:uid('review'),type:'首次发布',status:config.stage === 'reviewing' ? 'pending' : 'rejected',version:1,submitted:'2026-10-08 09:30:00',updated:'2026-10-08 10:10:00',remark:config.stage === 'rejected' ? '请补充科研成果的属性说明，并核对产出关系的方向。' : '',config:snapshot(item)});
    }
    return item;
  }
  api.items = [
    {id:'medical',name:'生物医药',description:'梳理药品、人群与疾病之间的关系，构建医药领域的知识体系。',stage:'published',entities:['药品','人群','疾病'],relations:[['适用于',0,1],['治疗',0,2]]},
    {id:'organization',name:'企业组织',description:'连接企业、部门与人员，清晰呈现组织架构和人员任职关系。',stage:'draft',entities:['企业','部门','人员'],relations:[['设立',0,1],['任职于',2,1]]},
    {id:'policy',name:'政策服务',description:'关联政策、企业与申报条件，支持政策检索和条件分析。',stage:'reviewing',entities:['政策','企业','申报条件'],relations:[['适用于',0,1],['要求',0,2]]},
    {id:'research',name:'科研项目',description:'围绕项目、研究人员和科研成果，梳理协作与产出。',stage:'rejected',entities:['项目','研究人员','科研成果'],relations:[['参与',1,0],['产出',0,2]]},
    {id:'product',name:'产品知识',description:'整理产品、功能与使用场景，为产品咨询提供支持。',stage:'published',enabled:false,entities:['产品','功能','使用场景'],relations:[['具备',0,1],['适用于',0,2]]},
    {id:'service',name:'客户服务',description:'整理客户问题与解决方案，沉淀服务知识。',stage:'draft',entities:[],relations:[]}
  ].map(sample);
  // 在原有样例之后追加层级，避免改变既有实体、关系和审核记录的标识。
  const medical = api.items.find(item => item.id === 'medical');
  medical.entities[0].properties[0].description = '填写药品的通用名称，例如：阿莫西林。';
  const chemical = {...entity('化学药',3),parentId:medical.entities[0].id,properties:[{...property(),name:'剂型',description:'说明药品的制剂形式，例如：片剂、胶囊剂。'}]};
  const antibiotic = {...entity('抗菌药',4),parentId:chemical.id,properties:[{...property(),name:'作用机制'}]};
  const biological = {...entity('生物制品',5),parentId:medical.entities[0].id,properties:[{...property(),name:'生产工艺'}]};
  medical.entities.push(chemical,antibiotic,biological);
  medical.live.config = snapshot(medical);
  api.item = () => api.items.find(item => item.id === api.currentId);
  api.status = item => item.stage === 'published' && item.live && !item.live.enabled ? 'disabled' : item.stage;
  api.dirty = () => Boolean(api.draft && signature(api.draft) !== api.savedSignature);
  api.locked = () => api.item()?.stage === 'reviewing';
  api.loadDraft = item => { api.currentId = item.id; api.draft = snapshot(item); api.savedSignature = signature(item); api.selected = null; api.previewMode = 'draft'; };
  api.basicError = (name,id) => {
    if (!name.trim()) return '请填写本体名称。';
    if (api.items.some(item => item.id !== id && item.name.toLowerCase() === name.trim().toLowerCase())) return '已存在同名本体，请换一个名称。';
    return '';
  };
  api.create = (name,description) => {
    const item = {id:uid('ontology'),name:name.trim(),description:description.trim(),entities:[],relations:[],stage:'draft',live:null,history:[],created:now().slice(0,16),updated:now().slice(0,16)};
    api.items.unshift(item); return item;
  };

  /** 保存只改变工作草稿；已生效快照必须等审核通过才能替换。 */
  api.save = () => {
    if (api.locked()) return false;
    const item = api.item();
    const changed = api.dirty();
    api.draft.name = api.draft.name.trim(); api.draft.description = api.draft.description.trim();
    Object.assign(item,snapshot(api.draft),{updated:now().slice(0,16)});
    if (changed) item.stage = 'draft';
    api.savedSignature = signature(api.draft); return true;
  };
  function propertyError(owner) {
    const names = new Set();
    for (const value of owner.properties) {
      const name = value.name.trim().toLowerCase();
      if (!name) return '存在未命名的属性，请补全后再提交。';
      if (names.has(name)) return '同一类型中的属性名称不能重复。';
      names.add(name);
    }
    return '';
  }
  api.validate = () => {
    const draft = api.draft, names = new Set(), triples = new Set();
    const hierarchyError = validateHierarchy(draft);
    if (hierarchyError) return hierarchyError;
    if (!draft.entities.length) return {message:'请至少添加一种实体类型，再提交发布审核。',tab:'entities'};
    for (const item of draft.entities) {
      const name = item.name.trim().toLowerCase();
      const message = !name ? '请补全实体类型名称。' : names.has(name) ? '实体类型名称不能重复。' : propertyError(item);
      if (message) return {message,tab:'entities',id:item.id};
      names.add(name);
    }
    for (const item of draft.relations) {
      const endpoints = draft.entities.some(value => value.id === item.from) && draft.entities.some(value => value.id === item.to);
      const key = JSON.stringify([item.name.trim().toLowerCase(),item.from,item.to]);
      const message = !item.name.trim() ? '请补全关系名称。' : !endpoints ? '请为关系选择有效的起点和终点实体。' : triples.has(key) ? '相同实体之间的同名关系不能重复。' : propertyError(item);
      if (message) return {message,tab:'relations',id:item.id};
      triples.add(key);
    }
    return null;
  };
  api.submit = () => {
    const item = api.item();
    if (api.dirty() || api.locked() || api.validate()) return false;
    const version = (item.live?.version || 0) + 1;
    item.history.unshift({id:uid('review'),type:item.live ? '版本更新' : '首次发布',status:'pending',version,submitted:now(),updated:now(),remark:'',config:snapshot(item)});
    item.stage = 'reviewing'; return true;
  };
  api.withdraw = () => {
    const item = api.item(), pending = item.history.find(record => record.status === 'pending');
    if (!pending) return;
    pending.status = 'withdrawn'; pending.updated = now(); pending.remark = '申请人已撤回，可修改后重新提交。';
    item.stage = 'draft';
  };
  /** 演示审核只处理已提交的快照，绝不发布后来未保存的编辑内容。 */
  api.review = (approved,remark) => {
    const item = api.item(), pending = item.history.find(record => record.status === 'pending');
    if (!pending) return;
    pending.status = approved ? 'approved' : 'rejected'; pending.updated = now(); pending.remark = remark;
    if (approved) item.live = {version:pending.version,enabled:item.live ? item.live.enabled : true,config:clone(pending.config)};
    item.stage = approved ? 'published' : 'rejected';
  };
  api.toggle = item => { if (item.live && item.stage !== 'reviewing') item.live.enabled = !item.live.enabled; };

  /** 原型以可解释的领域示例模拟建议，UI 明示并非实际模型生成。 */
  api.suggest = prompt => {
    let config = {label:'通用知识',entities:['业务对象','知识主题','资料'],relations:[['涉及',0,1],['参考',0,2]]};
    if (/医药|药品|疾病|医疗/.test(prompt)) config = {label:'生物医药',entities:['药品','疾病','人群','生产企业'],relations:[['治疗',0,1],['适用于',0,2],['生产',3,0]]};
    else if (/政策|申报/.test(prompt)) config = {label:'政策服务',entities:['政策','企业','申报条件'],relations:[['适用于',0,1],['要求',0,2]]};
    else if (/科研|研究人员|科研成果/.test(prompt)) config = {label:'科研项目',entities:['项目','研究人员','科研成果'],relations:[['参与',1,0],['产出',0,2]]};
    else if (/企业|组织|部门/.test(prompt)) config = {label:'企业组织',entities:['企业','部门','人员','产品'],relations:[['设立',0,1],['任职于',2,1],['生产',0,3]]};
    const result = sample({...config,id:uid('suggestion'),name:'',description:'',stage:'draft'});
    return {label:config.label,entities:result.entities,relations:result.relations};
  };
  api.mergeSuggestion = suggestion => {
    const draft = api.draft, ids = new Map();
    let entityCount = 0, relationCount = 0;
    suggestion.entities.forEach(source => {
      const existing = draft.entities.find(item => item.name.trim().toLowerCase() === source.name.toLowerCase());
      ids.set(source.id,existing?.id || source.id);
      if (!existing) { draft.entities.push(clone(source)); entityCount++; }
    });
    suggestion.relations.forEach(source => {
      const value = {...clone(source),from:ids.get(source.from),to:ids.get(source.to)};
      const exists = draft.relations.some(item => item.name.trim() === value.name && item.from === value.from && item.to === value.to);
      if (!exists) { draft.relations.push(value); relationCount++; }
    });
    return {entityCount,relationCount};
  };
  return api;
})();
