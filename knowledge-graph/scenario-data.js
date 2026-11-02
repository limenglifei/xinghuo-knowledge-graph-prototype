/* 三阶段业务样例：仅写入本页内存，共用正常任务、融合处理和质检计算，不覆盖用户操作。 */
(() => {
  const K = KG, X = K.extract, R = K.results;
  let initialized = false;
  const scenarios = [
    {id:'scenario-extract',name:'供应链协同',description:'关联供应企业、产品与供货关系，整理供应链协作知识。',
      types:['企业','产品'],relation:'供应',names:['星辰供应链有限公司','工业传感器'],documents:['org-04','org-03'],stage:'extract'},
    {id:'scenario-fuse',name:'企业经营',description:'整理企业及其经营资质，统一不同资料中的企业名称与关联信息。',
      types:['企业','资质'],relation:'具备',names:['星辰科技有限公司','高新技术企业资质'],documents:['org-05','org-04'],stage:'fuse'},
    {id:'scenario-quality',name:'组织协同',description:'梳理企业和部门的设立关系，统一组织资料中的名称与归属。',
      types:['企业','部门'],relation:'设立',names:['星辰科技有限公司','产品研发部'],documents:['org-01','org-02'],stage:'quality'},
    {id:'scenario-checking',name:'政策申报',description:'关联扶持政策与适用企业，为申报条件分析提供知识依据。',
      types:['政策','企业'],relation:'适用于',names:['科技创新扶持政策','星辰科技有限公司'],documents:['pol-01','pol-02'],stage:'checking'},
    {id:'scenario-report',name:'产品服务',description:'四类问题待核对示例：检查孤立实体、疑似重复、属性缺失和约束违反，体验对应处理流程。',
      types:['产品','使用场景'],relation:'适用于',names:['智能客服助手','在线咨询'],documents:['product-service-01','product-service-02'],stage:'report'},
    {id:'scenario-application',name:'企业协作',description:'连接企业、部门和人员，展现组织架构、人员任职与跨部门协作。',
      types:['企业','部门','人员'],relation:'设立',names:['星辰科技有限公司','产品研发部'],documents:['org-01','org-02','org-06'],stage:'application'},
    {id:'scenario-knowledge-service',name:'知识服务',description:'梳理知识服务团队的组织架构、人员任职与协作关系，便于持续维护知识服务。',
      types:['企业','部门','人员'],relation:'设立',names:['星辰知识服务有限公司','知识运营部'],documents:['org-01','org-02','org-06'],stage:'advisory'},
    K.partyLearningExample.definition,
    {id:'scenario-drug-prevention',name:'禁毒知识图谱',description:'围绕禁毒教育活动关联风险识别、防范措施和求助渠道，仅演示教育与预防内容。',
      types:['教育活动','风险类别','防范措施','求助渠道'],relation:'关注',names:['青少年禁毒主题课','陌生来源物品风险'],
      documents:['drug-prevention-01','drug-prevention-02','drug-prevention-03'],stage:'domain',
      definitions:[['关注',0,1],['介绍',0,2],['提供',0,3],['应对',2,1]],
      entityRows:[['-staff-event','职工禁毒宣传周',0,0],['-online-risk','网络不明信息风险',1,1],
        ['-refuse-measure','拒绝不明来源物品',2,1],['-verify-measure','核对信息来源',2,1],
        ['-ask-measure','及时表达困惑',2,2],['-school-channel','校园支持联络点（示例）',3,2],
        ['-community-channel','社区宣传咨询点（示例）',3,2]],
      relationRows:[['-focus-online',0,'-staff-event','-online-risk',0],['-introduce-refuse',1,'-main','-refuse-measure',1],
        ['-introduce-verify',1,'-staff-event','-verify-measure',1],['-introduce-ask',1,'-main','-ask-measure',2],
        ['-provide-school',2,'-main','-school-channel',2],['-provide-community',2,'-staff-event','-community-channel',2],
        ['-respond-item',3,'-refuse-measure','-target',1],['-respond-online',3,'-verify-measure','-online-risk',1],
        ['-respond-question',3,'-ask-measure','-online-risk',2]]}
  ];
  scenarios.push(K.fusionExamples.definition);

  /** 领域资料进入同一可选择目录；替换冻结集合，保留原资料与既有任务快照。 */
  function addDomainDocuments() {
    const sources = [{id:'party-training-library',name:'企业培训资料库（示例）'},
      {id:'drug-prevention-library',name:'禁毒教育资料库（示例）'},
      {id:'product-service-library',name:'产品服务资料库（示例）'},
      {id:'party-learning-library',name:'国企党校学习知识资料库（示例）'}];
    X.sources = Object.freeze([...X.sources,...sources.filter(source => !X.sources.some(existing => existing.id === source.id)).map(Object.freeze)]);
    const rows = [
      ['party-training-01','党校季度培训计划（示例）',0,['培训计划'],'党校培训',12,['党校','培训班'],['举办','党建理论','企业治理']],
      ['party-training-02','课程与讲师安排（示例）',0,['课程安排'],'党校培训',16,['党校','培训班','课程','讲师'],['开设','讲授','党建理论','企业治理']],
      ['party-training-03','研学与参训部门记录（示例）',0,['研学记录'],'党校培训',10,['培训班','课程','讲师','部门'],['开设','讲授','参加','实践研学']],
      ['drug-prevention-01','禁毒教育活动方案（示例）',1,['禁毒教育'],'禁毒教育',10,['教育活动','风险类别'],['关注','风险识别','教育预防']],
      ['drug-prevention-02','风险识别与防范课堂材料（示例）',1,['风险识别'],'禁毒教育',14,['教育活动','风险类别','防范措施'],['介绍','应对','防范']],
      ['drug-prevention-03','咨询求助与支持联络演练（示例）',1,['求助演练'],'禁毒教育',8,['教育活动','防范措施','求助渠道','风险类别'],['介绍','提供','应对','求助']],
      ['product-service-01','产品服务目录（示例）',2,['产品目录'],'产品服务',18,['产品','使用场景'],['适用于','服务编号','服务时长']],
      ['product-service-02','客服场景与服务配置（示例）',2,['客服场景'],'产品服务',16,['产品','使用场景'],['适用于','在线咨询','服务配置']],
      ['party-learning-01','国企党校知识体系与学习内容指引（示例）',3,['知识体系','学习内容'],'党校学习',18,['知识体系','知识模块','知识点'],['包含模块','涵盖知识点','理论基础','党建实务']],
      ['party-learning-02','分层分类学习重点与人群指引（示例）',3,['学习人群','学习重点'],'党校学习',15,['知识体系','知识模块','知识点','学习人群'],['重点学习','学习模块','全体党员','党务工作人员','中层管理人员','青年骨干']],
      ['party-learning-03','考核方式与学习成果评价指引（示例）',3,['考核方式','成果评价'],'党校学习',12,['知识点','学习人群','考核方式'],['采用考核','检验知识','专题测验','案例分析报告','情景实操','学习成果交流']]
    ];
    X.ingestDocuments(rows.map(([id,title,sourceIndex,tags,category,pages,entities,keywords]) => ({
      id,title,sourceId:sources[sourceIndex].id,sourceName:sources[sourceIndex].name,tags,category,pages,entities,keywords
    })));
  }

  /** 每个领域拥有独立的定义与发布快照，编辑样例不会影响其它本体。 */
  function addOntology(scenario) {
    const entities = scenario.types.map((name,index) => ({
      id:scenario.id + '-type-' + index,name,parentId:'',color:K.colors[index],
      properties:[{id:scenario.id + '-name-' + index,name:'名称',type:'文本',required:true}]
    }));
    (scenario.properties || []).forEach((fields,index) => fields.forEach(([name,type,required = false],fieldIndex) => {
      entities[index].properties.push({id:scenario.id + '-field-' + index + '-' + fieldIndex,name,type,required});
    }));
    if (scenario.stage === 'report') entities[0].properties.push(
      {id:scenario.id + '-service-code',name:'服务编号',type:'文本',required:true},
      {id:scenario.id + '-service-duration',name:'服务时长（分钟）',type:'数字',required:false}
    );
    const definitions = scenario.definitions || (['application','advisory'].includes(scenario.stage) ? [['设立',0,1],['任职于',2,1],['协作',1,1]] : [[scenario.relation,0,1]]);
    const relations = definitions.map(([name,from,to],index) => ({id:scenario.id + '-relation' + (index ? '-' + index : ''),
      name,from:entities[from].id,to:entities[to].id,properties:(scenario.relationProperties?.[index] || []).map(([field,type],fieldIndex) => ({
        id:scenario.id + '-relation-field-' + index + '-' + fieldIndex,name:field,type,required:false
      }))}));
    const item = {id:scenario.id,name:scenario.name,description:scenario.description,entities,relations,stage:'published',
      created:'2026-10-07 09:00',updated:'2026-10-08 10:00',history:[]};
    item.live = {version:1,enabled:true,config:K.snapshot(item)};
    item.history.push({id:scenario.id + '-publish',type:'首次发布',status:'approved',version:1,
      submitted:'2026-10-07 09:30:00',updated:'2026-10-07 10:00:00',remark:'实体与关系定义清晰，审核通过。',config:K.snapshot(item)});
    K.items.push(item);
    return item;
  }

  /** 完成样例保留真实目标、来源范围及完整进度快照，列表和任务记录采用同一份数据。 */
  function addExtraction(scenario) {
    const draft = X.newDraft(scenario.id);
    draft.name = scenario.name + '知识抽取-2026Q4';
    draft.targetIds = X.selectableElements(scenario.id).map(target => target.id);
    draft.strategies = Object.fromEntries(draft.targetIds.map(id => [id,X.defaultStrategy()]));
    draft.scope = {mode:'document',ids:scenario.documents};
    const result = X.createTask(draft);
    if (result.error) throw new Error('无法初始化抽取样例：' + result.error);
    result.task.status = 'completed';
    result.task.created = '2026-10-08 10:10:00';
    Object.values(result.task.progress).forEach(value => { value.processed = value.total; value.failed = 0; });
    return result.task;
  }

  function evidence(scenario,index,quote) {
    const documentId = scenario.documents[index], doc = X.documents.find(value => value.id === documentId);
    return [{documentId,title:doc.title,page:index + 2,quote:'资料摘录（示例）：' + quote}];
  }

  /** 同名实例来自两份资料，供待融合样例实际执行对齐；已完成样例也通过相同流程合并。 */
  function addResults(scenario,item,task) {
    const entity = (suffix,name,typeIndex,sourceIndex,values = {},quote = '') => {
      const details = {...scenario.entityValues?.[suffix],...values};
      const excerpt = quote || name + (Object.keys(details).length ? '；' + Object.entries(details).map(([key,value]) => key + '：' + value).join('，') : '');
      return {
      id:scenario.id + suffix,ontologyId:item.id,typeId:item.entities[typeIndex].id,name,
      confidence:96 - sourceIndex,status:'approved',properties:{'名称':name,
        ...(scenario.stage === 'report' && typeIndex === 0 ? {'服务编号':'SRV-001','服务时长（分钟）':30} : {}),...details},taskId:task.id,
      reviewedAt:'2026-10-08 10:20:00',sources:evidence(scenario,sourceIndex,excerpt)
      };
    };
    if (scenario.stage === 'fusion-review') {
      K.fusionExamples.addResults(scenario,item,task,entity); return;
    }
    const primary = entity('-main',scenario.names[0],0,0), duplicate = entity('-duplicate',scenario.names[0],0,1);
    const target = entity('-target',scenario.names[1],1,0);
    R.entities.push(primary,duplicate,target);
    R.relations.push({id:scenario.id + '-link',ontologyId:item.id,typeId:item.relations[0].id,
      fromId:duplicate.id,toId:target.id,confidence:95,status:'approved',properties:{...scenario.baseRelationProperties},taskId:task.id,
      reviewedAt:'2026-10-08 10:20:00',sources:evidence(scenario,0,scenario.names[0] + ' ' + scenario.relation + ' ' + target.name)});
    if (['application','advisory'].includes(scenario.stage)) addApplicationResults(scenario,item,task,entity);
    if (scenario.stage === 'domain') addDomainResults(scenario,item,task,entity);
    // 仅保留一个属性完整、尚未关联的部门，让建议发布依据实际检查得分和问题等级判定。
    if (scenario.stage === 'advisory') R.entities.push(entity('-advisory-orphan','培训支持组',1,1));
    if (scenario.stage === 'report') addReportResults(scenario,item,task,entity);
  }

  /** 四类问题各四项；重复关系保留不同文档来源，不被实体融合自动清除。 */
  function addReportResults(scenario,item,task,entity) {
    const product = (suffix,name,code,duration,quote) => {
      const value = entity(suffix,name,0,0);
      value.properties = {'名称':name,'服务编号':code,'服务时长（分钟）':duration};
      value.sources = evidence(scenario,0,quote || name + '，服务编号 ' + code + '，服务时长 ' + duration + ' 分钟。');
      R.entities.push(value); return value;
    };
    const connect = (value,suffix,sourceIndex = 1) => R.relations.push({
      id:scenario.id + suffix,ontologyId:item.id,typeId:item.relations[0].id,fromId:value.id,toId:scenario.id + '-target',
      confidence:95,status:'approved',properties:{},taskId:task.id,reviewedAt:'2026-10-08 10:20:00',
      sources:evidence(scenario,sourceIndex,value.name + '适用于在线咨询。')
    });
    ['线下咨询','客户培训','售后回访','渠道协作'].forEach((name,index) => {
      const value = entity('-isolated-' + index,name,1,1);
      value.sources = evidence(scenario,1,name + '已列入场景清单，尚未登记对应产品。'); R.entities.push(value);
    });
    ['在线问答助手','知识检索助手','工单分派助手','会话摘要助手'].forEach((name,index) => {
      const value = product('-repeated-' + index,name,'SRV-10' + index,20);
      connect(value,'-repeated-link-' + index + '-a',0); connect(value,'-repeated-link-' + index + '-b',1);
    });
    ['客户反馈助手','服务回访助手','多语客服助手','常见问题助手'].forEach((name,index) => {
      const value = product('-missing-' + index,name,'',20,name + '登记编号为 SRV-20' + index + '，服务时长 20 分钟；待补齐抽取结果中的编号。');
      connect(value,'-missing-link-' + index);
    });
    [['人工协作助手','十五分钟',15],['服务导航助手','20分钟',20],['意图识别助手','半小时',30],['资料推荐助手','约45分钟',45]].forEach(([name,duration,minutes],index) => {
      const value = product('-invalid-' + index,name,'SRV-30' + index,duration,
        name + '，服务编号 SRV-30' + index + '，配置时长为 ' + minutes + ' 分钟；原文“' + duration + '”需整理为数值。');
      connect(value,'-invalid-link-' + index);
    });
  }

  /** 应用样例补足企业、部门、人员三层连接；重复企业仍交给正常融合处理，不预先伪造合并结果。 */
  function addApplicationResults(scenario,item,task,entity) {
    const rows = [['-engineering','知识工程部',1,0],['-customer','客户成功部',1,0],
      ['-person-product','林晓',2,1],['-person-engineering','陈思远',2,1],['-person-customer','周宁',2,1]];
    R.entities.push(...rows.map(row => entity(...row)));
    const links = [['-establish-engineering',0,'-main','-engineering',0],['-establish-customer',0,'-main','-customer',0],
      ['-position-product',1,'-person-product','-target',1],['-position-engineering',1,'-person-engineering','-engineering',1],
      ['-position-customer',1,'-person-customer','-customer',1],['-collaboration-product',2,'-target','-engineering',2],
      ['-collaboration-customer',2,'-engineering','-customer',2]];
    links.forEach(([suffix,typeIndex,from,to,sourceIndex]) => {
      const type = item.relations[typeIndex], origin = R.entity(scenario.id + from), target = R.entity(scenario.id + to);
      R.relations.push({id:scenario.id + suffix,ontologyId:item.id,typeId:type.id,fromId:origin.id,toId:target.id,
        confidence:96,status:'approved',properties:{},taskId:task.id,reviewedAt:'2026-10-08 10:20:00',
        sources:evidence(scenario,sourceIndex,origin.name + ' ' + type.name + ' ' + target.name)});
    });
  }

  /** 新领域沿用真实实例与来源结构；同名主节点仍由正常融合流程处理。 */
  function addDomainResults(scenario,item,task,entity) {
    R.entities.push(...scenario.entityRows.map(row => entity(...row)));
    scenario.relationRows.forEach(([suffix,typeIndex,from,to,sourceIndex,properties = {},quote = '']) => {
      const type = item.relations[typeIndex], origin = R.entity(scenario.id + from), target = R.entity(scenario.id + to);
      R.relations.push({id:scenario.id + suffix,ontologyId:item.id,typeId:type.id,fromId:origin.id,toId:target.id,
        confidence:96,status:'approved',properties,taskId:task.id,reviewedAt:'2026-10-08 10:20:00',
        sources:evidence(scenario,sourceIndex,quote || origin.name + ' ' + type.name + ' ' + target.name)});
    });
  }

  /** 初始化时将新融合案例与两个领域案例前置；更新时间相同时易于找到，仍遵守各列表的时间排序。 */
  function prioritizeDomainScenarios() {
    const ids = ['scenario-training-fusion','scenario-party-training','scenario-drug-prevention'];
    const featured = ids.map(id => K.items.find(item => item.id === id)).filter(Boolean);
    const remaining = K.items.filter(item => !ids.includes(item.id));
    K.items.splice(0,K.items.length,...featured,...remaining);
  }

  /** 初始化只运行一次；后续刷新界面、筛选或切换页签绝不重置已经处理的样例。 */
  function initialize() {
    if (initialized) return;
    initialized = true;
    addDomainDocuments();
    scenarios.forEach(scenario => {
      const item = addOntology(scenario);
      if (scenario.stage !== 'extract') addResults(scenario,item,addExtraction(scenario));
    });
    scenarios.filter(scenario => ['quality','checking','report','application','advisory','domain'].includes(scenario.stage)).forEach(scenario => {
      const result = K.fusionTasks.seedCompleted(scenario.id);
      if (!result.completed) throw new Error('融合样例未完成：' + scenario.name + '；' + (result.error || '请核对待处理内容'));
    });
    [['scenario-checking','running'],['scenario-report','completed'],['scenario-application','completed'],
      ['scenario-knowledge-service','completed'],['scenario-party-training','completed'],['scenario-drug-prevention','completed']].forEach(([id,mode]) => {
      const result = K.qualityUI.seedScenario(id,mode);
      if (!result.ok) throw new Error('质检样例未就绪：' + result.reason);
    });
    K.fusionExamples.seedTask();
    prioritizeDomainScenarios();
  }
  K.scenarios = {initialize};
})();
