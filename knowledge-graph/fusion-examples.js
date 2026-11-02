/* 融合专项样例独立于已完成图谱；问题、任务、来源和处理结果使用同一份页面数据。 */
(() => {
  const K = KG, id = 'scenario-training-fusion';
  const definition = {
    id,name:'企业培训',stage:'fusion-review',
    description:'统一培训机构、班次、课程与讲师的多源资料，核对名称简称、上下文指代及时间地点差异。',
    types:['党校','培训班','课程','讲师','部门'],relation:'举办',
    documents:['party-training-01','party-training-02','party-training-03'],
    definitions:[['举办',0,1],['开设',1,2],['讲授',3,2],['参加',4,1]],
    properties:[
      [['机构编号','文本']],
      [['培训编号','文本'],['培训时长（学时）','数字'],['开班日期','日期']],
      [['课程编号','文本'],['授课地点','文本']],
      [['讲师编号','文本'],['任职部门','文本']],
      [['部门编号','文本']]
    ]
  };
  // 每组使用独立实例；处理某条建议不会使另一组的待审核对象失效。
  const alignments = [
    {key:'school',type:0,names:['星辰集团党校','星辰党校'],confidence:98,sources:[0,1],
      properties:{'机构编号':'DX-001'},reason:'季度计划使用机构全称，课程安排使用简称；两份资料的机构编号均为 DX-001，建议统一名称。'},
    {key:'class',type:1,names:['青年干部能力提升班','青干班'],confidence:89,sources:[0,2],
      properties:{'培训编号':'PX-001','培训时长（学时）':'32'},reason:'培训计划写全称，参训记录使用“青干班”；培训编号 PX-001 相同，需确认是否为同一期培训。'},
    {key:'course',type:2,names:['企业治理案例研讨','企业治理案例研讨课程'],confidence:92,sources:[1,2],
      properties:{'课程编号':'KC-001'},reason:'两份资料的课程编号均为 KC-001，名称仅多出“课程”后缀，建议核对后合并来源。'},
    {key:'department',type:4,names:['综合管理部','综合管理部门'],confidence:78,sources:[2,0],
      properties:{'部门编号':'BM-001'},reason:'参训部门记录与培训计划采用不同称呼，部门编号 BM-001 一致；需人工确认是否指同一部门。'}
  ];
  const coreferences = [
    {key:'class',type:1,names:['本次培训','党务能力提升班'],confidence:96,sources:[0,0],
      properties:{'培训编号':'PX-002'},reason:'同段先明确提到“党务能力提升班”，后文使用“本次培训”继续说明安排，建议归到同一培训班。',
      quote:'党务能力提升班纳入季度计划，培训编号 PX-002。本次培训将按计划安排开展。'},
    {key:'course',type:2,names:['该课程','党建理论专题'],confidence:93,sources:[1,1],
      properties:{'课程编号':'KC-002'},reason:'前句明确课程名称“党建理论专题”，后句的“该课程”承接其内容，需核对原文指代。',
      quote:'课程表列出党建理论专题，课程编号 KC-002。该课程采用专题讲授与交流相结合的形式。'},
    {key:'teacher',type:3,names:['他','王老师（示例）'],confidence:81,sources:[1,1],
      properties:{'讲师编号':'JS-001'},reason:'讲师介绍先出现“王老师”，后文以“他”指代；建议结合段落中的讲师信息人工确认。',
      quote:'王老师（示例）的讲师编号为 JS-001。他负责本期教学交流环节，课程安排另列。'},
    {key:'department',type:4,names:['该部门','人力资源部'],confidence:58,sources:[2,2],
      properties:{'部门编号':'BM-002'},reason:'段落同时提及人力资源部与组织培训部，“该部门”可能指人力资源部，但上下文仍有歧义，需要人工核对。',
      quote:'人力资源部（BM-002）与组织培训部沟通报名安排。该部门将在培训前汇总名单。'}
  ];
  const conflicts = [
    {key:'duration',type:1,name:'企业治理专题班',field:'培训时长（学时）',values:['24','32'],confidence:98,sources:[0,1],
      properties:{'培训编号':'PX-003'},reason:'季度计划记载 24 学时，课程安排合计为 32 学时。即使识别置信度高，也需人工核对采用哪一版安排。'},
    {key:'date',type:1,name:'党校教学研究班',field:'开班日期',values:['2026-10-20','2026-10-22'],confidence:88,sources:[0,2],
      properties:{'培训编号':'PX-004'},reason:'培训计划和参训记录中的开班日期不一致，需结合生效版本确认，不直接用后出现的日期覆盖。'},
    {key:'location',type:2,name:'实践研学活动',field:'授课地点',values:['第一培训教室','第二培训教室'],confidence:84,sources:[1,2],
      properties:{'课程编号':'KC-003'},reason:'课程安排登记第一培训教室，研学记录登记第二培训教室，需核对是否为调整后的场地。'},
    {key:'office',type:3,name:'李老师（示例）',field:'任职部门',values:['教学研究部','课程发展部'],confidence:76,sources:[1,2],
      properties:{'讲师编号':'JS-002'},reason:'两份讲师资料中的任职部门不同，可能存在信息更新；需核对后选择当前可信值，并保留原始记载。'}
  ];

  function source(scenario,index,quote) {
    const documentId = scenario.documents[index], doc = K.extract.documents.find(item => item.id === documentId);
    return {documentId,title:doc.title,page:index + 2,quote:'资料摘录（示例）：' + quote};
  }
  function describe(name,properties) {
    return name + '；' + Object.entries(properties).map(([field,value]) => field + '：' + value).join('，');
  }
  function createEntity(context,suffix,name,type,properties,index,quote) {
    const entity = context.entity(suffix,name,type,index);
    entity.properties = {'名称':name,...properties};
    entity.sources = [source(context.scenario,index,quote || describe(name,properties))];
    K.results.entities.push(entity); return entity;
  }
  function link(context,suffix,relationIndex,from,to) {
    const relation = context.item.relations[relationIndex];
    K.results.relations.push({id:id + '-relation-' + suffix,ontologyId:id,typeId:relation.id,
      fromId:from.id,toId:to.id,confidence:96,status:'approved',properties:{},taskId:context.task.id,
      reviewedAt:'2026-10-13 09:10:00',
      sources:[source(context.scenario,0,from.name + ' ' + relation.name + ' ' + to.name)]});
  }
  /** 合并时迁移真实关系，端点均遵循本体定义，不制造合并后的自环。 */
  function connect(context,suffix,entity,type) {
    const {school,training,course} = context.anchors;
    if (type === 0) link(context,suffix,0,entity,training);
    if (type === 1) link(context,suffix,0,school,entity);
    if (type === 2) link(context,suffix,1,training,entity);
    if (type === 3) link(context,suffix,2,entity,course);
    if (type === 4) link(context,suffix,3,entity,training);
  }
  function addAlignment(context,sample) {
    const key = 'alignment-' + sample.key;
    const main = createEntity(context,'-' + key + '-main',sample.names[0],sample.type,sample.properties,sample.sources[0]);
    const alias = createEntity(context,'-' + key + '-alias',sample.names[1],sample.type,sample.properties,sample.sources[1]);
    connect(context,key,alias,sample.type);
    K.fusionUI.candidates.push({id:id + '-' + key,ontologyId:id,category:'alignment',
      entityIds:[main.id,alias.id],title:main.name + ' ↔ ' + alias.name,reason:sample.reason,
      confidence:sample.confidence,status:'pending'});
  }
  function addCoreference(context,sample) {
    const key = 'coreference-' + sample.key;
    const main = createEntity(context,'-' + key + '-main',sample.names[1],sample.type,sample.properties,sample.sources[0]);
    const mention = createEntity(context,'-' + key + '-mention',sample.names[0],sample.type,{},sample.sources[1],sample.quote);
    connect(context,key,mention,sample.type);
    K.fusionUI.candidates.push({id:id + '-' + key,ontologyId:id,category:'coreference',
      entityIds:[mention.id,main.id],title:'“' + mention.name + '” → ' + main.name,reason:sample.reason,
      confidence:sample.confidence,status:'pending'});
  }
  function addConflict(context,sample) {
    const key = 'conflict-' + sample.key;
    const properties = {...sample.properties,[sample.field]:sample.values[0]};
    const entity = createEntity(context,'-' + key,sample.name,sample.type,properties,sample.sources[0]);
    entity.sources.push(source(context.scenario,sample.sources[1],describe(sample.name,{...sample.properties,[sample.field]:sample.values[1]})));
    connect(context,key,entity,sample.type);
    K.fusionUI.candidates.push({id:id + '-' + key,ontologyId:id,category:'conflict',entityIds:[entity.id],
      title:sample.name + ' · ' + sample.field + '不一致',reason:sample.reason,confidence:sample.confidence,
      status:'pending',field:sample.field,values:sample.values});
  }
  function addResults(scenario,item,task,entity) {
    const context = {scenario,item,task,entity};
    context.anchors = {
      school:createEntity(context,'-anchor-school','星辰培训中心',0,{'机构编号':'DX-000'},0),
      training:createEntity(context,'-anchor-training','企业能力提升计划',1,{'培训编号':'PX-000'},0),
      course:createEntity(context,'-anchor-course','课程设计工作坊',2,{'课程编号':'KC-000'},1)
    };
    link(context,'anchor-hold',0,context.anchors.school,context.anchors.training);
    link(context,'anchor-offer',1,context.anchors.training,context.anchors.course);
    alignments.forEach(sample => addAlignment(context,sample));
    coreferences.forEach(sample => addCoreference(context,sample));
    conflicts.forEach(sample => addConflict(context,sample));
  }
  /** 候选先明确分组，再交给正常任务执行，列表计数与审核入口共用真实任务归属。 */
  function seedGroups(ontologyId,groups) {
    // 新任务插入列表首位，逆序创建以保留首条原任务名及既有跳转入口。
    [...groups].reverse().forEach(group => {
      const outcome = K.fusionTasks.seedExample(ontologyId,{threshold:95,...group});
      if (!outcome.ok) throw new Error('融合任务样例未就绪：' + group.name + '；' + outcome.error);
    });
  }
  function seedTask() {
    const candidateIds = (category,samples) => samples.map(sample => id + '-' + category + '-' + sample.key);
    seedGroups(id,[
      {seedKey:'alignment',name:'企业培训资料融合核对',candidateIds:candidateIds('alignment',alignments)},
      {seedKey:'coreference',name:'课程与讲师指代核对',candidateIds:candidateIds('coreference',coreferences.filter(sample => sample.key !== 'class'))},
      {seedKey:'conflict',name:'培训时间与场地冲突解析',candidateIds:candidateIds('conflict',conflicts)},
      {seedKey:'completed',name:'培训计划指代归并',candidateIds:[id + '-coreference-class']}
    ]);
    const medical = K.fusionUI.prepareTask('medical',[]);
    const medicalIds = category => medical.filter(item => item.category === category).map(item => item.id);
    seedGroups('medical',[
      {seedKey:'alignment',name:'药品名称与疾病同名记录对齐',threshold:90,candidateIds:medicalIds('alignment')},
      {seedKey:'coreference',name:'药品资料上下文指代核对',candidateIds:medicalIds('coreference')},
      {seedKey:'conflict',name:'药品生产企业信息冲突解析',candidateIds:medicalIds('conflict')}
    ]);
  }
  K.fusionExamples = {definition,addResults,seedTask};
})();
