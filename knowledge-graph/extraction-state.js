/* 知识抽取评审数据：只在当前页面内存中演示，不调用模型、不产生费用。 */
(() => {
  const clone = KG.clone;
  const text = value => String(value ?? '').trim();
  const unique = values => [...new Set(Array.isArray(values) ? values : [])];
  const X = {tasks:[],recommendations:[]};
  const observed = new Map();
  const emit = (type,taskId) => document.dispatchEvent(new CustomEvent('kg:extraction-change',{detail:{type,...(taskId ? {taskId} : {})}}));

  /** 配置与任务执行进度分离，已创建任务不跟随之后的本体或向导编辑变化。 */
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  X.sources = freeze([
    {id:'medical-library',name:'医药资料库'},
    {id:'clinical-library',name:'临床研究库'},
    {id:'enterprise-library',name:'企业经营资料库'},
    {id:'policy-library',name:'政策文件库'}
  ]);
  const documentRows = [
    ['med-01','常用药品说明书汇编','medical-library',['药品资料','用药指南'],'医药',28,['药品','疾病','人群'],['治疗','适应症','适用','用药']],
    ['med-02','慢性病合理用药指南','medical-library',['用药指南','慢性病'],'医药',36,['药品','疾病','人群'],['治疗','用药','疗效','人群']],
    ['med-03','儿童用药注意事项','medical-library',['用药指南','特殊人群'],'医药',12,['药品','人群'],['适用于','儿童','禁忌','剂量']],
    ['med-04','药品生产企业名录','medical-library',['药品资料','生产企业'],'医药',20,['药品','生产企业','企业'],['生产','制造','药品']],
    ['med-05','药品储存与运输规范','medical-library',['药品资料','质量管理'],'医药',15,['药品','生产企业'],['储存','运输','质量']],
    ['med-06','疾病诊疗术语手册','medical-library',['疾病知识'],'医药',24,['疾病'],['诊断','症状','分类']],
    ['med-07','临床疗效观察报告','clinical-library',['临床研究','慢性病'],'医药',32,['药品','疾病','人群'],['疗效','治疗','研究']],
    ['med-08','特殊人群临床试验纳入标准','clinical-library',['临床研究','特殊人群'],'医药',18,['药品','人群'],['适用','入组','禁忌']],
    ['med-09','医药研发项目阶段总结','clinical-library',['临床研究','科研项目'],'医药',26,['项目','研究人员','科研成果','药品'],['参与','产出','研发']],
    ['org-01','企业组织架构说明','enterprise-library',['组织管理'],'企业',14,['企业','部门','人员'],['设立','任职于','组织']],
    ['org-02','部门岗位与职责手册','enterprise-library',['组织管理','岗位职责'],'企业',30,['部门','人员'],['任职于','负责','职责']],
    ['org-03','年度产品目录','enterprise-library',['产品资料'],'企业',22,['企业','产品','功能','使用场景'],['生产','具备','适用于']],
    ['org-04','供应商合作清单','enterprise-library',['供应链'],'企业',17,['企业','产品'],['供应','合作','采购']],
    ['org-05','企业资质及经营概况','enterprise-library',['企业档案'],'企业',11,['企业'],['资质','经营','成立']],
    ['org-06','项目成员与成果档案','enterprise-library',['科研项目','组织管理'],'企业',19,['项目','研究人员','科研成果','部门'],['参与','产出','协作']],
    ['pol-01','高新技术企业申报指南','policy-library',['政策申报','科技创新'],'政策',25,['政策','企业','申报条件'],['适用于','要求','申报']],
    ['pol-02','中小企业扶持政策汇编','policy-library',['政策申报','企业扶持'],'政策',34,['政策','企业','申报条件'],['适用','要求','扶持']],
    ['pol-03','科技项目申报条件说明','policy-library',['政策申报','科技创新'],'政策',16,['政策','项目','申报条件'],['要求','申报','条件']],
    ['pol-04','园区企业补贴问答','policy-library',['企业扶持'],'政策',10,['政策','企业'],['适用','补贴','对象']],
    ['pol-05','政策材料清单与填写示例','policy-library',['政策申报'],'政策',13,['政策','申报条件'],['要求','材料','清单']],
    ['pol-06','公共政策术语词典','policy-library',['政策知识'],'政策',21,['政策'],['定义','解释','术语']]
  ];
  X.documents = freeze(documentRows.map(row => {
    const [id,title,sourceId,tags,category,pages,entities,keywords] = row;
    return {id,title,sourceId,sourceName:X.sources.find(source => source.id === sourceId).name,tags,category,pages,entities,keywords};
  }));
  X.tags = freeze(unique(X.documents.flatMap(doc => doc.tags)));

  /** 只返回仍可使用的发布快照；已发布本体的编辑草稿不会进入选择树。 */
  X.ontologies = () => KG.items.filter(item => item.live?.enabled).map(item => ({
    id:item.id,name:item.live.config.name,version:item.live.version,config:clone(item.live.config)
  }));
  const available = id => X.ontologies().find(item => item.id === id);

  function ownerElements(owner,kind,config) {
    const group = kind === 'entity' ? 'entities' : 'relations';
    const id = `${kind}:${owner.id}`;
    const entityName = entityId => config.entities.find(entity => entity.id === entityId)?.name || '未命名实体';
    const label = kind === 'entity' ? (KG.hierarchy?.path(config,owner.id) || owner.name) : `${entityName(owner.from)} — ${owner.name} → ${entityName(owner.to)}`;
    const properties = kind === 'entity' && KG.hierarchy ? KG.hierarchy.effective(config,owner.id) : owner.properties || [];
    const depth = kind === 'entity' ? KG.hierarchy?.depth(config,owner.id) || 1 : 1;
    return [{id,kind,name:owner.name,label,group,depth,parentTypeId:owner.parentId || null},...properties.map(property => ({
      id:`property:${owner.id}:${property.id}`,kind:'property',name:property.name,
      label:`${label} / ${property.name}`,parentId:id,parentLabel:label,group,depth,inheritedFrom:property.fromName || '',
      propertyId:property.id,type:property.type,required:Boolean(property.required),description:String(property.description || '')
    }))];
  }

  /** 保留完整扁平树供原有展示使用；属性的 parentId 指向完整带前缀的类型 ID，不再独立勾选。 */
  X.elements = ontologyId => {
    const ontology = available(ontologyId);
    if (!ontology) return [];
    return ontology.config.entities.flatMap(owner => ownerElements(owner,'entity',ontology.config))
      .concat(ontology.config.relations.flatMap(owner => ownerElements(owner,'relation',ontology.config)));
  };

  /** 新任务只选择实体/关系；其全部属性（含继承属性）随目标自动纳入快照。 */
  X.selectableElements = ontologyId => {
    const elements = X.elements(ontologyId);
    return elements.filter(element => element.kind !== 'property').map(element => ({
      ...element,properties:elements.filter(property => property.parentId === element.id).map(clone)
    }));
  };

  /** 同一范围中的条件取并集；返回的文档按资料目录去重，不扩大到其它范围。 */
  X.resolveDocuments = scope => {
    const ids = unique(scope?.ids);
    if (scope?.mode === 'source') return X.documents.filter(doc => ids.includes(doc.sourceId));
    if (scope?.mode === 'tag') return X.documents.filter(doc => doc.tags.some(tag => ids.includes(tag)));
    if (scope?.mode === 'document') return X.documents.filter(doc => ids.includes(doc.id));
    return [];
  };

  X.models = freeze(['DeepSeek','星火 X2']);
  X.defaultStrategy = () => ({mode:'llm',model:'DeepSeek',instruction:'',rule:'关键词匹配',keywords:''});

  /** 估算用固定演示系数，cost 是展示用金额，不代表供应商报价或真实消耗。 */
  X.estimate = (docIds,targetIds,strategies = {}) => {
    const docs = X.resolveDocuments({mode:'document',ids:docIds});
    const targets = unique(targetIds);
    const pages = docs.reduce((sum,doc) => sum + doc.pages,0);
    const modelTargets = targets.filter(id => (strategies[id]?.mode || 'llm') === 'llm').length;
    const tokens = pages * modelTargets * 850;
    const minutes = targets.length && pages ? Math.max(1,Math.ceil(pages * (modelTargets * .08 + (targets.length - modelTargets) * .015))) : 0;
    return {documents:docs.length,pages,tokens,cost:Number((tokens / 1000 * .002).toFixed(2)),minutes};
  };

  /** 空目标由用户主动选择；指定了失效本体时不偷偷换成另一套本体。 */
  X.newDraft = ontologyId => {
    const ontology = ontologyId ? available(ontologyId) : X.ontologies()[0];
    return {ontologyId:ontology?.id || ontologyId || '',version:ontology?.version || null,name:'',targetIds:[],
      strategies:{},scope:{mode:'source',ids:[]},routing:{high:90,medium:60,overrides:{}},recommendationId:null};
  };

  function validateTargets(draft) {
    const ontology = available(draft?.ontologyId);
    if (!ontology) return '请选择仍在启用中的已发布本体。';
    if (ontology.version !== draft.version) return '本体已发布新版本，请重新选择本体并核对抽取目标。';
    if (!text(draft.name)) return '请填写任务名称。';
    if (text(draft.name).length > 50) return '任务名称最多填写 50 个字。';
    const targets = unique(draft.targetIds);
    if (!targets.length) return '请至少选择一个实体或关系作为抽取目标。';
    if (targets.some(id => id.startsWith('property:'))) return '属性会随实体或关系自动抽取，请选择对应的实体或关系。';
    const elements = X.selectableElements(draft.ontologyId);
    if (targets.some(id => !elements.some(element => element.id === id))) return '部分抽取目标已失效，请重新选择。';
    return null;
  }

  function strategyError(strategy) {
    if (!strategy || !['llm','rule'].includes(strategy.mode)) return '请选择抽取方式。';
    if (strategy.mode === 'llm') return X.models.includes(text(strategy.model)) ? null : '请选择 DeepSeek 或星火 X2 模型。';
    if (!['关键词匹配','词典匹配','正则表达式'].includes(strategy.rule)) return '请选择有效的抽取规则。';
    if (!text(strategy.keywords)) return '请填写规则的关键词、词典内容或表达式。';
    if (strategy.rule !== '正则表达式') return null;
    try { new RegExp(strategy.keywords); } catch (error) { return '正则表达式格式有误，请检查后重试。'; }
    return null;
  }

  function validateStrategies(draft) {
    const elements = X.elements(draft.ontologyId);
    for (const id of unique(draft.targetIds)) {
      const error = strategyError(draft.strategies?.[id]);
      if (error) return `${elements.find(element => element.id === id)?.label || '抽取目标'}：${error}`;
    }
    return null;
  }

  function validateScope(draft) {
    const scope = draft.scope || {};
    const options = {source:X.sources.map(source => source.id),document:X.documents.map(doc => doc.id)};
    if (!options[scope.mode]) return '请选择知识库或指定文档范围。';
    if (!unique(scope.ids).length) return '请至少选择一个数据范围。';
    if (unique(scope.ids).some(id => !options[scope.mode].includes(id))) return '部分数据范围已失效，请重新选择。';
    return X.resolveDocuments(scope).length ? null : '当前范围内没有文档，请调整数据范围。';
  }

  const validThresholds = value => value && Number.isFinite(Number(value.high)) && Number.isFinite(Number(value.medium)) &&
    Number(value.medium) > 0 && Number(value.medium) < Number(value.high) && Number(value.high) <= 100;

  function validateRouting(draft) {
    if (!validThresholds(draft.routing)) return '置信度阈值需满足：0 ＜ 中置信度阈值 ＜ 高置信度阈值 ≤ 100。';
    return null;
  }

  function validateRecommendation(draft) {
    if (!draft.recommendationId) return null;
    const recommendation = X.recommendations.find(item => item.id === draft.recommendationId);
    if (!recommendation) return '该补充建议已失效，请返回推荐列表重新选择。';
    if (recommendation.taskId) return '这条建议已创建补充任务，请查看已有任务，避免重复抽取。';
    if (recommendation.ontologyId !== draft.ontologyId || recommendation.version !== draft.version) return '推荐对应的本体版本已变化，请重新打开建议。';
    if (recommendation.kind === 'documents') return recommendation.targetIds.some(id => draft.targetIds.includes(id)) ? null : '请保留至少一个推荐目标，或返回列表新建普通任务。';
    return draft.targetIds.includes(`relation:${recommendation.relationId}`) ? null : '请保留推荐关系作为抽取目标，或返回列表新建普通任务。';
  }

  /** step 从 1 开始；第 4 步及创建前重新检查全部条件，防止使用失效发布版本。 */
  X.validate = (draft,step = 4) => {
    const basic = validateTargets(draft);
    if (basic || step === 1) return basic;
    if (step === 2) return validateStrategies(draft);
    if (step === 3) return validateScope(draft);
    return validateStrategies(draft) || validateScope(draft) || validateRouting(draft) || validateRecommendation(draft);
  };

  function normalizedStrategies(draft) {
    return Object.fromEntries(unique(draft.targetIds).map(id => {
      const strategy = {...X.defaultStrategy(),...draft.strategies[id]};
      ['model','instruction','rule','keywords'].forEach(key => { strategy[key] = text(strategy[key]); });
      return [id,strategy];
    }));
  }

  function scopeSummary(scope) {
    const names = scope.mode === 'source' ? unique(scope.ids).map(id => X.sources.find(source => source.id === id)?.name) :
      scope.mode === 'tag' ? unique(scope.ids) : [`已指定 ${X.resolveDocuments(scope).length} 篇文档`];
    return `${{source:'按知识库',tag:'按标签',document:'按文档'}[scope.mode]} · ${names.join('、')}`;
  }

  function routingSnapshot(routing) {
    // 只采用任务统一阈值，保留空对象兼容详情读取，不允许旧的元素独立阈值继续影响新任务。
    return {high:Number(routing.high),medium:Number(routing.medium),overrides:{}};
  }

  function taskSnapshot(draft) {
    const ontology = available(draft.ontologyId);
    const targets = X.selectableElements(draft.ontologyId).filter(target => draft.targetIds.includes(target.id));
    const docIds = X.resolveDocuments(draft.scope).map(doc => doc.id);
    const strategies = normalizedStrategies(draft);
    return {id:KG.uid('extraction'),name:text(draft.name),ontologyId:ontology.id,ontologyName:ontology.name,version:ontology.version,
      targets:freeze(clone(targets)),strategies:freeze(strategies),scope:freeze({mode:draft.scope.mode,ids:unique(draft.scope.ids),summary:scopeSummary(draft.scope)}),
      docIds:freeze(docIds),routing:freeze(routingSnapshot(draft.routing)),estimate:freeze(X.estimate(docIds,draft.targetIds,strategies)),
      progress:Object.fromEntries(targets.map(target => [target.id,{processed:0,total:docIds.length,failed:0}])),
      status:'running',created:KG.now(),recommendationId:draft.recommendationId || null};
  }

  /** 成功后绑定推荐，第二次创建同一推荐会返回 error，不会再产生任务。 */
  X.createTask = draft => {
    const error = X.validate(draft,4);
    if (error) return {task:null,error};
    const task = taskSnapshot(draft);
    X.tasks.unshift(task);
    const recommendation = X.recommendations.find(item => item.id === draft.recommendationId);
    if (recommendation) recommendation.taskId = task.id;
    emit('created',task.id);
    return {task};
  };

  /** processed 表示成功完成的文档数；重试不清空这些结果，只把失败项恢复待处理。 */
  X.retryTask = id => {
    const task = X.tasks.find(item => item.id === id);
    if (!task) return {task:null,error:'任务不存在，请返回列表重新选择。'};
    if (task.status !== 'partial' || !Object.values(task.progress).some(value => value.failed)) return {task:null,error:'该任务没有可重试的失败项。'};
    Object.values(task.progress).forEach(value => { value.failed = 0; });
    task.status = 'running'; task.updated = KG.now();
    emit('retried',task.id);
    return {task};
  };

  function domain(config) {
    const value = `${config.name} ${config.entities.map(entity => entity.name).join(' ')}`;
    if (/医药|药品|疾病/.test(value)) return '医药';
    if (/政策|申报条件/.test(value)) return '政策';
    if (/企业|部门|人员|产品/.test(value)) return '企业';
    return '';
  }

  function relationTerms(name) {
    const terms = {治疗:['治疗','适应症','疗效'],适用于:['适用','适用于','适应症','人群','对象'],生产:['生产','制造'],
      要求:['要求','申报','条件'],设立:['设立','组织'],任职于:['任职于','岗位','职责'],参与:['参与','协作'],产出:['产出','成果']};
    return terms[name] || [name];
  }

  /** 用资料元信息解释候选范围，不把候选文档表述成已抽取命中结果。 */
  function recommendationScope(ontology,relation) {
    const from = ontology.config.entities.find(entity => entity.id === relation.from)?.name;
    const to = ontology.config.entities.find(entity => entity.id === relation.to)?.name;
    const category = domain(ontology.config);
    const terms = relationTerms(relation.name);
    const matches = X.documents.map(doc => {
      const both = from !== to && doc.entities.includes(from) && doc.entities.includes(to);
      const keyword = terms.some(term => term && `${doc.title} ${doc.keywords.join(' ')}`.includes(term));
      const sameCategory = Boolean(category && category === doc.category);
      const score = (both ? 4 : 0) + (keyword ? 2 : 0) + (sameCategory ? 2 : 0);
      return {doc,both,keyword,sameCategory,score};
    }).filter(match => match.score >= 4 && (match.both || match.keyword));
    return {from,to,category,matches};
  }

  function recommendationReasons(scope) {
    if (!scope.matches.length) return [{title:'暂无可解释的候选范围',description:'示例资料中未找到足够的分类、关键词或实体共现线索，请手工选择文档后创建补充任务。'}];
    const count = key => scope.matches.filter(match => match[key]).length;
    return [
      {title:'文档分类',description:`候选范围中 ${count('sameCategory')} 篇属于${scope.category || '相近'}领域。`},
      {title:'关系关键词',description:`${count('keyword')} 篇的标题或资料关键词与该关系相关。`},
      {title:'端点实体共现',description:`${count('both')} 篇的资料标注同时包含“${scope.from || '起点实体'}”与“${scope.to || '终点实体'}”。以上为候选估算，需抽取后确认。`}
    ];
  }

  function buildRecommendation(ontology,relation) {
    const scope = recommendationScope(ontology,relation);
    const relationId = `relation:${relation.id}`;
    const targets = X.selectableElements(ontology.id).filter(element => element.id === relationId);
    const docIds = scope.matches.map(match => match.doc.id);
    const targetIds = targets.map(target => target.id);
    const strategies = Object.fromEntries(targetIds.map(id => [id,X.defaultStrategy()]));
    return {id:KG.uid('recommendation'),ontologyId:ontology.id,ontologyName:ontology.name,version:ontology.version,
      kind:'relation',relationId:relation.id,relationLabel:targets.find(target => target.kind === 'relation')?.label || relation.name,
      targetIds,docIds,reasons:recommendationReasons(scope),estimate:X.estimate(docIds,targetIds,strategies),taskId:null};
  }

  function refreshOpenRecommendations(ontology) {
    let changed = false;
    X.recommendations = X.recommendations.filter(record => {
      if (record.taskId || record.ontologyId !== ontology.id || record.version === ontology.version) return true;
      if (record.kind === 'documents') {
        const replacement = documentRecommendation(ontology,record.docIds);
        changed = true;
        if (!replacement) return false;
        Object.assign(record,replacement,{id:record.id}); return true;
      }
      const relation = ontology.config.relations.find(item => item.id === record.relationId);
      changed = true;
      if (!relation) return false;
      Object.assign(record,buildRecommendation(ontology,relation),{id:record.id});
      return true;
    });
    return changed;
  }

  /** 仅比较审核通过的发布版本；新增草稿关系、保存或提交审核均不会触发推荐。 */
  X.syncRecommendations = () => {
    const beforeCount = X.recommendations.length;
    X.recommendations = X.recommendations.filter(record => record.taskId || KG.items.some(item => item.id === record.ontologyId && item.live));
    let changed = beforeCount !== X.recommendations.length;
    X.ontologies().forEach(ontology => {
      const previous = observed.get(ontology.id);
      if (previous && previous.version === ontology.version) return;
      const oldIds = previous?.relationIds || [];
      if (refreshOpenRecommendations(ontology)) changed = true;
      ontology.config.relations.filter(relation => !oldIds.includes(relation.id)).forEach(relation => {
        if (X.recommendations.some(record => record.ontologyId === ontology.id && record.version === ontology.version && record.relationId === relation.id)) return;
        X.recommendations.unshift(buildRecommendation(ontology,relation));
        changed = true;
      });
      observed.set(ontology.id,{version:ontology.version,relationIds:ontology.config.relations.map(relation => relation.id)});
    });
    if (changed) emit('recommendations');
    return X.recommendations;
  };

  /** 无候选文档时保留空范围，向导会引导手动选文档，不替换成全部文档。 */
  X.recommendedDraft = id => {
    const record = X.recommendations.find(item => item.id === id);
    const ontology = record && available(record.ontologyId);
    if (!record || record.taskId || !ontology || ontology.version !== record.version) return null;
    const draft = X.newDraft(ontology.id);
    draft.name = `${ontology.name} · ${record.kind === 'documents' ? '新增文档' : ontology.config.relations.find(relation => relation.id === record.relationId)?.name || '新增关系'}补充抽取`.slice(0,50);
    const selectableIds = new Set(X.selectableElements(ontology.id).map(element => element.id));
    draft.targetIds = clone(record.targetIds).filter(id => selectableIds.has(id));
    draft.strategies = Object.fromEntries(draft.targetIds.map(target => [target,X.defaultStrategy()]));
    draft.scope = {mode:'document',ids:clone(record.docIds)};
    draft.recommendationId = record.id;
    return draft;
  };

  function seedTask(ontology,options) {
    const draft = X.newDraft(ontology.id);
    draft.name = options.name;
    draft.targetIds = X.selectableElements(ontology.id).slice(0,options.targets).map(element => element.id);
    draft.strategies = Object.fromEntries(draft.targetIds.map(id => [id,X.defaultStrategy()]));
    draft.scope = {mode:'source',ids:[options.source]};
    const task = taskSnapshot(draft);
    task.status = options.status;
    task.created = options.created;
    Object.values(task.progress).forEach((value,index) => {
      value.failed = options.status === 'partial' && index === 0 ? Math.min(2,value.total) : 0;
      value.processed = options.status === 'running' ? Math.min(index + 1,value.total - 1) : value.total - value.failed;
    });
    X.tasks.push(task);
  }

  /** 新资料只推荐匹配领域或类型的目标；重复同步不会重复生成补充建议。 */
  function documentRecommendation(ontology,ids) {
    const docs = X.documents.filter(doc => ids.includes(doc.id) && (doc.category === domain(ontology.config) || ontology.config.entities.some(entity => doc.entities.includes(entity.name))));
    if (!docs.length) return null;
    const matchedIds = ontology.config.entities.filter(entity => docs.some(doc => doc.entities.includes(entity.name))).map(entity => entity.id);
    const entityIds = matchedIds.length ? matchedIds : ontology.config.entities.map(entity => entity.id);
    const relations = ontology.config.relations.filter(relation => entityIds.includes(relation.from) && entityIds.includes(relation.to));
    const ownerIds = [...entityIds.map(id => 'entity:' + id),...relations.map(item => 'relation:' + item.id)];
    const targetIds = X.selectableElements(ontology.id).filter(item => ownerIds.includes(item.id)).map(item => item.id);
    if (!targetIds.length) return null;
    const docIds = docs.map(doc => doc.id);
    return {id:KG.uid('recommendation'),kind:'documents',ontologyId:ontology.id,ontologyName:ontology.name,version:ontology.version,
      relationLabel:'新增领域文档 · ' + docs.length + ' 篇',targetIds,docIds,taskId:null,estimate:X.estimate(docIds,targetIds),
      reasons:[{title:'领域匹配',description:'资料分类或标注类型与当前本体一致。仅推荐新增文档，不重复扫描全部资料。'},
        {title:'新增资料',description:docs.map(doc => doc.title).join('、')},{title:'建议目标',description:ontology.config.entities.filter(entity => entityIds.includes(entity.id)).map(entity => entity.name).join('、') + '及其相关关系和属性'}]};
  }

  /** 原型中文档接入事件，保留已有任务的文档快照，不会执行真实上传或同步。 */
  X.ingestDocuments = documents => {
    const added = documents.filter(doc => !X.documents.some(existing => existing.id === doc.id));
    if (!added.length) return 0;
    X.documents = freeze([...X.documents,...clone(added)]);
    X.tags = freeze(unique(X.documents.flatMap(doc => doc.tags)));
    X.ontologies().forEach(ontology => {
      const recommendation = documentRecommendation(ontology,added.map(doc => doc.id));
      if (recommendation) X.recommendations.unshift(recommendation);
    });
    emit('documents'); return added.length;
  };

  X.checkDocumentUpdates = () => X.ingestDocuments([
    {id:'med-new-03',title:'医药资料分类与适用人群补充说明',sourceId:'medical-library',sourceName:'医药资料库',tags:['药品资料','特殊人群'],category:'医药',pages:16,entities:['药品','人群','疾病'],keywords:['适用','治疗','分类']},
    {id:'med-new-04',title:'药品企业信息更新清单',sourceId:'medical-library',sourceName:'医药资料库',tags:['药品资料','生产企业'],category:'医药',pages:9,entities:['药品','生产企业'],keywords:['生产','药品']}
  ]);

  function initialize() {
    KG.items.filter(item => item.live).forEach(item => observed.set(item.id,{version:item.live.version,relationIds:item.live.config.relations.map(relation => relation.id)}));
    const medical = available('medical');
    if (!medical) return;
    const targets = X.selectableElements(medical.id).length;
    seedTask(medical,{name:'生物医药知识首批抽取',status:'running',targets,source:'medical-library',created:'2026-10-08 10:20:00'});
    seedTask(medical,{name:'临床研究资料抽取',status:'completed',targets,source:'clinical-library',created:'2026-10-08 09:10:00'});
    seedTask(medical,{name:'药品资料抽取',status:'partial',targets,source:'medical-library',created:'2026-10-07 16:30:00'});
    const relation = medical.config.relations.find(item => item.name === '治疗') || medical.config.relations[0];
    if (relation) X.recommendations.push(buildRecommendation(medical,relation));
  }

  KG.extract = X;
  initialize();
  X.ingestDocuments([{id:'med-new-01',title:'医药领域资料补充汇编（十月）',sourceId:'medical-library',sourceName:'医药资料库',tags:['药品资料'],category:'医药',pages:18,entities:['药品','人群','疾病'],keywords:['治疗','适用']}]);
})();
