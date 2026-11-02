/* 消息中心共用样例。通知只保存事件信息；点击不会执行审核、发布或后台任务。 */
(() => {
  const scriptUrl = document.currentScript?.src || new URL('knowledge-graph/notification-data.js',location.href).href;
  const pageUrl = new URL('index.html',scriptUrl);
  const today = new Date().toLocaleString('sv-SE').slice(0,10);
  const rows = [
    {id:'ontology-approved',category:'ontology-review',label:'本体审核',status:'approved',name:'生物医药',
      time:'2026-10-07 10:12:00',target:{ontologyId:'medical',tab:'modeling',reviewStatus:'approved'}},
    {id:'ontology-rejected',category:'ontology-review',label:'本体审核',status:'rejected',name:'科研项目',
      reason:'请补充科研成果的属性说明，并核对产出关系的方向。',time:'2026-10-08 10:10:00',
      target:{ontologyId:'research',tab:'modeling',reviewStatus:'rejected'}},
    {id:'graph-approved',category:'graph-review',label:'图谱审核',status:'approved',name:'企业协作',
      time:'2026-10-13 10:19:58',remark:'图谱结构、来源依据和质检结果已核对，审核通过。',submitted:'2026-10-13 09:40:00',
      target:{ontologyId:'scenario-application',tab:'quality',reviewStatus:'approved'}},
    {id:'graph-rejected',category:'graph-review',label:'图谱审核',status:'rejected',name:'禁毒知识图谱',
      time:'2026-10-13 10:18:20',reason:'请补充教育资料的适用对象与来源说明后重新提交。',submitted:'2026-10-13 09:42:00',
      target:{ontologyId:'scenario-drug-prevention',tab:'quality',reviewStatus:'rejected'}},
    {id:'extraction-completed',category:'extraction',label:'知识抽取',status:'completed',name:'国企党校培训',
      taskName:'国企党校培训知识抽取-2026Q4',time:'2026-10-08 10:20:00',
      target:{ontologyId:'scenario-party-training',tab:'extraction',taskName:'国企党校培训知识抽取-2026Q4'}},
    {id:'extraction-failed',category:'extraction',label:'知识抽取',status:'failed',statusLabel:'部分失败',name:'生物医药',
      taskName:'药品资料抽取',reason:'部分目标文档处理失败，已完成的抽取结果保留，可在任务详情重试失败部分。',time:'2026-10-07 16:45:00',
      target:{ontologyId:'medical',tab:'extraction',taskName:'药品资料抽取'}},
    {id:'fusion-completed',category:'fusion',label:'知识融合',status:'completed',name:'国企党校培训',
      taskName:'国企党校培训-知识融合-' + today,time:'2026-10-13 10:12:06',
      target:{ontologyId:'scenario-party-training',tab:'fusion',taskName:'国企党校培训-知识融合-' + today}},
    {id:'fusion-failed',category:'fusion',label:'知识融合',status:'failed',name:'企业经营',
      taskName:'企业经营增量融合',reason:'本次任务读取来源文档超时，尚未生成融合结果。原有实体、关系及审核记录未改变。',time:'2026-10-13 10:08:35',
      target:{ontologyId:'scenario-fuse',tab:'fusion',eventOnly:true}},
    {id:'quality-completed',category:'quality',label:'图谱质检',status:'completed',name:'国企党校培训',
      reportVersion:1,time:'2026-10-13 10:14:48',target:{ontologyId:'scenario-party-training',tab:'quality',reportVersion:1}},
    {id:'quality-failed',category:'quality',label:'图谱质检',status:'failed',name:'组织协同',
      reportVersion:1,reason:'本次检测读取图谱数据超时，未生成 V1 报告，未增加成功质检记录。可重新发起质检。',time:'2026-10-13 10:05:42',
      target:{ontologyId:'scenario-quality',tab:'quality',eventOnly:true}}
  ];
  function title(item) {
    const prefix = '【' + item.label + '】您的【' + item.name + '】';
    if (item.category.endsWith('-review')) return prefix + (item.category === 'ontology-review' ? '本体' : '图谱') +
      '发布审核已' + (item.status === 'approved' ? '通过' : '驳回，原因：【' + item.reason + '】');
    if (item.category === 'quality') return prefix + '图谱质检报告【V' + item.reportVersion + '】' + (item.status === 'completed' ? '已生成' : '生成失败');
    return prefix + '本体【' + item.taskName + '】' + item.label + '任务' +
      (item.status === 'completed' ? '已完成' : item.statusLabel === '部分失败' ? '部分失败' : '失败');
  }
  const items = Object.freeze(rows.map(item => Object.freeze({...item,title:title(item),target:Object.freeze(item.target)})));
  function url(item) {
    const record = items.find(value => value.id === (typeof item === 'string' ? item : item?.id));
    if (!record) return '';
    const address = new URL(pageUrl.href),target = record.target;
    address.search = new URLSearchParams({revision:'41',notice:record.id}).toString();
    address.hash = target.tab === 'modeling' ? 'edit=' + encodeURIComponent(target.ontologyId) :
      'tab=' + target.tab + '&graph=' + encodeURIComponent(target.ontologyId);
    return address.href;
  }
  window.KGNotifications = Object.freeze({items,url});
})();
