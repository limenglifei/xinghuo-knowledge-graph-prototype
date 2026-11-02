/* 党校案例聚焦学习内容、适用人群与考核。安排均为产品样例，不代表统一培训要求。 */
(() => {
  const properties = [
    [['知识范围','文本'],['培养目标','文本']],
    [['学习目标','文本'],['学习顺序','数字']],
    [['内容摘要','文本'],['学习重点','文本',true],['掌握要求','文本']],
    [['岗位特点','文本'],['学习目标','文本']],
    [['考核内容','文本'],['成果形式','文本'],['评价要点','文本']]
  ];
  const relationProperties = [
    [['模块定位','文本'],['学习顺序','数字']],
    [['内容定位','文本'],['学习顺序','数字']],
    [['学习侧重','文本'],['掌握要求','文本']],
    [['学习目标','文本'],['学习建议','文本']],
    [['考核目的','文本'],['成果要求','文本']],
    [['考查重点','文本'],['评价说明','文本']]
  ];
  const entityRows = [
    ['-module-discipline','党性教育与纪律意识',1,0,{'学习目标':'形成纪律意识与廉洁履职意识','学习顺序':2}],
    ['-module-practice','党建实务',1,0,{'学习目标':'掌握基层党建工作方法并联系岗位实践','学习顺序':3}],
    ['-module-governance','企业治理与履职能力',1,0,{'学习目标':'理解治理职责，提升决策与风险识别能力','学习顺序':4}],
    ['-point-theory','党的创新理论学习',2,0,{'内容摘要':'理解基本观点与方法，联系企业实际开展学习研讨','学习重点':'联系实际理解与运用','掌握要求':'能够结合岗位说明学习体会'}],
    ['-point-history','党史与优良传统',2,0,{'内容摘要':'通过历史案例理解优良传统与工作作风','学习重点':'历史经验与岗位实践的联系','掌握要求':'能够提炼案例启示'}],
    ['-point-discipline','纪律规矩与廉洁履职',2,0,{'内容摘要':'识别履职过程中的纪律要求与廉洁风险场景','学习重点':'风险场景识别与自我约束','掌握要求':'能够分析情境并说明行动选择'}],
    ['-point-branch','党支部工作规范',2,1,{'内容摘要':'学习支部工作组织、过程记录与工作复盘的基本方法','学习重点':'组织实施、过程记录与改进','掌握要求':'能够完成一份工作方案'}],
    ['-point-integration','党建与生产经营融合',2,1,{'内容摘要':'围绕经营任务设计党建工作切入点和协同机制','学习重点':'目标衔接与成效评价','掌握要求':'能够提出一个结合岗位的实践方案'}],
    ['-point-governance','公司治理与科学决策',2,1,{'内容摘要':'理解治理角色、议事协同和科学决策的基本思路','学习重点':'职责边界、决策依据与协同','掌握要求':'能够分析治理案例中的职责和流程'}],
    ['-point-risk','风险防控与合规意识',2,1,{'内容摘要':'围绕岗位情境识别经营风险与合规关注点','学习重点':'','掌握要求':'能够形成风险识别清单'},'风险防控与合规意识的学习重点为“岗位风险识别与处置意识”，以风险清单作为学习成果。'],
    ['-point-communication','群众工作与沟通协同',2,1,{'内容摘要':'学习需求了解、沟通反馈与跨岗位协作的方法','学习重点':'','掌握要求':'能够完成一次沟通情境演练'},'群众工作与沟通协同重点学习“需求了解、沟通反馈与协作”，通过情境演练检验掌握情况。'],
    ['-audience-all','全体党员',3,1,{'岗位特点':'覆盖不同岗位的党员学习者','学习目标':'夯实理论基础与纪律意识'}],
    ['-audience-party','党务工作人员',3,1,{'岗位特点':'承担基层党建组织与服务工作','学习目标':'提升支部工作组织与实践能力'}],
    ['-audience-manager','中层管理人员',3,1,{'岗位特点':'承担团队管理与业务决策职责','学习目标':'提升治理协同与风险防控意识'}],
    ['-audience-young','青年骨干',3,1,{'岗位特点':'处于岗位能力与协作能力提升阶段','学习目标':'形成理论联系实际与沟通协同能力'}],
    ['-assessment-test','专题测验',4,2,{'考核内容':'理论基础与纪律意识','成果形式':'主题测验答卷','评价要点':'概念理解与情境判断'}],
    ['-assessment-case','案例分析报告',4,2,{'考核内容':'治理职责与经营风险情境','成果形式':'案例分析报告','评价要点':'依据充分、分析清晰、建议可行'}],
    ['-assessment-practice','情景实操',4,2,{'考核内容':'支部工作组织与党建实践设计','成果形式':'方案演练与过程记录','评价要点':'过程完整、方法适当、联系岗位'}],
    ['-assessment-sharing','学习成果交流',4,2,{'考核内容':'历史案例启示与沟通协同实践','成果形式':'学习成果汇报','评价要点':'观点清晰、反思具体、能够应用'}],
    ['-orphan-reading','党校学习资料阅读方法',2,0,{'内容摘要':'整理阅读提问、摘录和复盘方法','学习重点':'带着问题阅读','掌握要求':'形成阅读笔记'},'资料附录列出党校学习资料阅读方法，尚未标注所属知识模块及适用学习人群。'],
    ['-orphan-review','学习成果复盘清单',2,2,{'内容摘要':'归纳学习收获与后续行动','学习重点':'学习成果向岗位行动转化','掌握要求':'形成后续行动清单'},'考核资料附录收录学习成果复盘清单，尚未明确关联的知识内容与考核方式。']
  ];
  const relationRows = [];
  const link = (suffix,type,from,to,source,values,quote) => relationRows.push([suffix,type,from,to,source,values,quote]);
  ['discipline','practice','governance'].forEach((key,index) =>
    link('-include-'+key,0,'-main','-module-'+key,0,{'模块定位':'学习体系组成模块','学习顺序':index+2}));
  const topics = [
    ['-target','theory',1],['-target','history',2],
    ['-module-discipline','discipline',1],['-module-discipline','communication',2],
    ['-module-practice','branch',1],['-module-practice','integration',2],
    ['-module-governance','governance',1],['-module-governance','risk',2]
  ];
  topics.forEach(([module,key,order]) => link('-topic-'+key,1,module,'-point-'+key,0,{'内容定位':'模块核心知识内容','学习顺序':order}));
  const plans = [
    ['all',['theory','discipline'],['-target','-module-discipline'],'test'],
    ['party',['branch','integration'],['-module-practice','-module-discipline'],'practice'],
    ['manager',['governance','risk'],['-module-governance','-module-discipline'],'case'],
    ['young',['history','communication'],['-target','-module-discipline'],'sharing']
  ];
  plans.forEach(([audience,points,modules,assessment]) => {
    points.forEach(point => link('-focus-'+audience+'-'+point,2,'-audience-'+audience,'-point-'+point,1,
      {'学习侧重':'重点学习','掌握要求':'结合岗位情境说明理解与应用'}));
    modules.forEach((module,index) => link('-learn-'+audience+'-'+index,3,'-audience-'+audience,module,1,
      {'学习目标':'形成与岗位相适应的知识结构','学习建议':'阅读、研讨与实践相结合'}));
    link('-assess-'+audience,4,'-audience-'+audience,'-assessment-'+assessment,2,
      {'考核目的':'检验重点知识的理解与应用','成果要求':'提交对应学习成果；具体要求按培训方案调整'});
    points.forEach(point => link('-check-'+assessment+'-'+point,5,'-assessment-'+assessment,'-point-'+point,2,
      {'考查重点':'知识理解与实际应用','评价说明':'结合成果质量与过程表现核对'}));
  });
  // 相同学习关系来自不同资料，保留给质检人工确认，不自动删除。
  link('-duplicate-topic',1,'-target','-point-theory',1,{'内容定位':'模块核心知识内容','学习顺序':1},
    '分层学习指引再次记载：理论基础涵盖党的创新理论学习；应核对是否与体系指引中的同一关系重复。');
  link('-duplicate-focus',2,'-audience-party','-point-branch',2,{'学习侧重':'重点学习','掌握要求':'结合岗位情境说明理解与应用'},
    '考核指引再次记载党务工作人员重点学习党支部工作规范；与学习指引中的关联需要核对去重。');
  // 错误端点与关系类型均有原文依据，便于直接体验“建议修改”。
  link('-wrong-assessment',4,'-point-theory','-assessment-test',2,{'考核目的':'补充检验理论理解','成果要求':'主题测验答卷'},
    '青年骨干可采用专题测验巩固理论理解。本条抽取误将知识点“党的创新理论学习”识别为考核人群。');
  link('-wrong-focus',2,'-audience-manager','-target',1,{'学习侧重':'理论补充学习','掌握要求':'理解并联系岗位'},
    '中层管理人员补充学习理论基础模块。本条关系应为“学习模块”，误记为只能指向知识点的“重点学习”。');
  const primary = {'知识范围':'理论基础、党性教育、党建实务、企业治理','培养目标':'明确学什么、谁来学、重点内容与考核方式'};
  KG.partyLearningExample = {definition:{
    id:'scenario-party-training',name:'国企党校培训',
    description:'构建国企党校培训知识体系，梳理知识模块、重点内容、学习人群与考核方式；支持按人群查看学习要求和考核依据。',
    types:['知识体系','知识模块','知识点','学习人群','考核方式'],
    relation:'包含模块',names:['国企党校培训知识体系','理论基础'],stage:'domain',
    documents:['party-learning-01','party-learning-02','party-learning-03'],
    definitions:[['包含模块',0,1],['涵盖知识点',1,2],['重点学习',3,2],['学习模块',3,1],['采用考核',3,4],['检验知识',4,2]],
    properties,relationProperties,entityRows,relationRows,
    entityValues:{'-main':primary,'-duplicate':primary,'-target':{'学习目标':'理解基本理论与历史经验，联系岗位实践','学习顺序':1}},
    baseRelationProperties:{'模块定位':'基础学习模块','学习顺序':1}
  }};
})();
