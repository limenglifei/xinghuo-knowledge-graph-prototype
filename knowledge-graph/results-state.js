/* 抽取结果、融合与质检共用的本页样例。所有审核仅作用于当前页面，不提交真实数据。 */
(() => {
  const K = window.KG, X = K.extract;
  const R = {entities:[],relations:[],version:1,history:[]};
  const active = item => item.status !== 'merged' && !item.mergedInto;
  R.forOntology = id => ({entities:R.entities.filter(item => item.ontologyId === id),relations:R.relations.filter(item => item.ontologyId === id)});
  R.entity = id => R.entities.find(item => item.id === id);
  R.touch = reason => {
    R.version += 1;
    document.dispatchEvent(new CustomEvent('kg:results-change',{detail:{reason,version:R.version}}));
  };
  R.config = id => X.ontologies().find(item => item.id === id)?.config;
  R.typeName = (ontologyId,kind,typeId) => {
    const config = R.config(ontologyId);
    if (!config) return '原类型已不可用';
    return (kind === 'entities' ? K.hierarchy?.path(config,typeId) : null) ||
      config[kind]?.find(item => item.id === typeId)?.name || '类型已移除';
  };
  /** 来源始终指向抽取时的资料和页码，融合不会抹掉原文证据。 */
  function source(documentId,page,quote) {
    return {documentId,title:X.documents.find(doc => doc.id === documentId)?.title || '资料记录',page,quote};
  }
  function seed() {
    const config = R.config('medical'); if (!config) return;
    const type = name => config.entities.find(item => item.name === name)?.id;
    const drug = type('药品'), antibiotic = type('抗菌药') || drug;
    const human = type('人群'), disease = type('疾病');
    const taskFor = documentId => X.tasks.find(item => item.docIds.includes(documentId))?.id;
    const rows = [
      ['e-amox','阿莫西林胶囊',antibiotic,96,'approved',{'名称':'阿莫西林胶囊','生产企业':'华安制药'},'med-01',3],
      ['e-amox-alias','阿莫西林（胶囊）',antibiotic,94,'approved',{'名称':'阿莫西林（胶囊）','生产企业':'华安制药'},'med-07',2],
      ['e-ibuprofen','布洛芬缓释胶囊',drug,97,'approved',{'名称':'布洛芬缓释胶囊','剂型':'胶囊'},'med-01',7],
      ['e-ibuprofen-ref','该药品',drug,91,'approved',{'名称':'该药品'},'med-07',6],
      ['e-adult','成人',human,98,'approved',{'名称':'成人'},'med-08',2],
      ['e-infection','细菌感染',disease,95,'approved',{'名称':'细菌感染'},'med-06',4],
      ['e-fever','发热',disease,92,'approved',{'名称':'发热'},'med-06',8],
      ['e-fever-copy','发热',disease,93,'approved',{'名称':'发热'},'med-07',5],
      ['e-missing','待补全名称的药品',drug,91,'approved',{'剂型':'片剂'},'med-01',12],
      ['e-pending-1','药品样例 A',antibiotic,87,'pending',{'名称':'药品样例 A','登记编号':'示例-001'},'med-02',3],
      ['e-pending-2','儿童',human,89,'pending',{'名称':'儿童'},'med-03',2],
      ['e-pending-3','人群样例 B',human,54,'pending',{'名称':'人群样例 B'},'med-08',4],
      ['e-rejected','药物相关词',drug,43,'rejected',{'名称':'药物相关词'},'med-09',2]
    ];
    R.entities = rows.map(([id,name,typeId,confidence,status,properties,documentId,page]) => ({
      id,ontologyId:'medical',typeId,name,confidence,status,properties,taskId:taskFor(documentId),
      sources:[source(documentId,page,'资料摘录（示例）：'+name+'；'+Object.entries(properties).map(([key,value]) => key+'：'+value).join('，'))]
    }));
    R.entity('e-amox').sources.push(source('med-04',5,'企业名录摘录（示例）：阿莫西林胶囊，生产企业：华康制药。'));
    R.entity('e-ibuprofen-ref').sources = [source('med-07',6,'原文示例：本段介绍布洛芬缓释胶囊。该药品的资料已纳入本次整理范围。')];
    const treatment = config.relations.find(item => item.name === '治疗')?.id;
    const suitable = config.relations.find(item => item.name === '适用于')?.id;
    R.relations = [
      ['r-amox',treatment,'e-amox','e-infection',95,'approved','med-01'],
      ['r-ibu',suitable,'e-ibuprofen','e-adult',96,'approved','med-08'],
      ['r-ref',suitable,'e-ibuprofen-ref','e-adult',92,'approved','med-07'],
      ['r-pending',suitable,'e-pending-1','e-pending-2',82,'pending','med-03'],
      ['r-pending-2',treatment,'e-ibuprofen','e-fever',76,'pending','med-07'],
      ['r-rejected',treatment,'e-pending-1','e-fever',46,'rejected','med-02']
    ].filter(row => row[1]).map(([id,typeId,fromId,toId,confidence,status,documentId]) => ({
      id,ontologyId:'medical',typeId,fromId,toId,confidence,status,taskId:taskFor(documentId),properties:{'依据':'原文明确提及'},
      sources:[source(documentId,2,'关系摘录（示例）：'+R.entity(fromId).name+' → '+config.relations.find(item => item.id === typeId).name+' → '+R.entity(toId).name)]
    }));
  }
  /** 类型看板默认包含子类型；每条结果按自身 ID 去重，不重复计入父类型汇总。 */
  R.rows = (options) => {
    const {ontologyId,kind,typeId,includeChildren = true} = options;
    const config = R.config(ontologyId), ids = new Set(typeId ? [typeId] : []);
    if (typeId && kind === 'entities' && includeChildren && config) K.hierarchy?.descendants(config,typeId).forEach(item => ids.add(item.id));
    return R[kind].filter(item => item.ontologyId === ontologyId && active(item) && (!typeId || ids.has(item.typeId)));
  };
  /** 覆盖率是已处理文档 / 任务目标文档，跨任务文档去重；样例进度按文档顺序记录。 */
  R.coverage = options => {
    const config = R.config(options.ontologyId), ids = new Set(options.typeId ? [options.typeId] : []);
    if (options.typeId && options.kind === 'entities' && options.includeChildren !== false && config) K.hierarchy?.descendants(config,options.typeId).forEach(item => ids.add(item.id));
    const total = new Set(), done = new Set(), prefix = options.kind === 'entities' ? 'entity:' : 'relation:';
    X.tasks.filter(task => task.ontologyId === options.ontologyId).forEach(task => {
      task.targets.filter(target => target.id.startsWith(prefix) && (!ids.size || ids.has(target.id.slice(prefix.length)))).forEach(target => {
        task.docIds.forEach(id => total.add(id));
        task.docIds.slice(0,task.progress[target.id]?.processed || 0).forEach(id => done.add(id));
      });
    });
    return {total:total.size,done:done.size,percent:total.size ? Math.round(done.size / total.size * 100) : null};
  };
  /** 审核不会自动合并实体；通过后仍须在融合页验证并人工确认。 */
  R.review = (kind,ids,status,reason = '') => {
    if (!['entities','relations'].includes(kind) || !['approved','rejected'].includes(status)) return '审核操作无效。';
    if (status === 'rejected' && !reason.trim()) return '请填写未通过的原因。';
    const rows = R[kind].filter(item => ids.includes(item.id));
    if (!rows.length || rows.some(item => item.status !== 'pending' || !R.config(item.ontologyId))) return '结果已更新或本体不可用，请刷新后重试。';
    rows.forEach(item => {
      item.status = status; item.reviewedAt = K.now(); item.reviewRemark = reason.trim();
      R.history.unshift({id:K.uid('result-review'),recordId:item.id,kind,status,reason:reason.trim(),at:item.reviewedAt});
    });
    R.touch('review'); return '';
  };
  seed();
  K.results = R;
})();
