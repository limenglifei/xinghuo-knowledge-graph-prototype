/* 质检后的图谱独立发布审核：仅操作本页内存，不改变本体发布状态或调用真实服务。 */
(() => {
  const K = KG;
  const records = new Map();
  const observedReports = new Map();
  let initialized = false;
  let synchronizing = false;
  let pendingSyncChange = false;
  let visibleSignature = '';
  const available = () => K.extract?.ontologies() || [];
  const latest = id => K.qualityUI?.latestReport?.(id) || null;
  const failure = error => ({ok:false,error});

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  /** 图谱发布状态与本体同名但独立；禁用只表示当前已发布图谱的开关。 */
  function status(item) {
    return item?.stage === 'published' && item.live && !item.live.enabled ? 'disabled' : item?.stage || 'draft';
  }

  // 当前完整性问题只来自必填缺失；约束违反与显式高风险问题均不能带入发布。
  function isMajor(issue) {
    const severity = String(issue?.severity || '').trim().toLowerCase();
    return ['critical','high'].includes(severity) || ['consistency','completeness'].includes(issue?.dimension);
  }

  /** 仅评估报告快照的发布门槛；最新性、检测状态与本体可用性由 reportFor 另行核对。 */
  function assessReport(report) {
    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const majorCount = issues.filter(isMajor).length, reviewCount = issues.length - majorCount;
    const scoreValid = Number.isFinite(report?.score) && report.score >= 95 && report.score <= 100;
    let reason = '';
    if (!report) reason = '尚无质检报告，请先执行质检。';
    else if (!scoreValid) reason = '综合评分需达到 95 分，且分值在有效范围内，请处理问题后重新质检。';
    else if (majorCount) reason = `存在 ${majorCount} 项重大问题，请先处理必填缺失、约束违反或高风险问题，再重新质检。`;
    else reason = reviewCount ? `存在 ${reviewCount} 项待核对提示，请确认可接受后提交发布审核。` : '质检符合发布条件，核对报告后可提交发布审核。';
    return {eligible:scoreValid && majorCount === 0,majorCount,reviewCount,reason};
  }

  /** 最新报告须达到 95 分且无重大问题；历史达标、检测中、过期或禁用本体不满足前置。 */
  function reportFor(id) {
    const ontology = available().find(item => item.id === id);
    const report = latest(id), summary = K.qualityUI?.overview(id);
    if (!ontology || !report || !summary || summary.loading || summary.stale) return null;
    if (summary.status !== 'detected' || !summary.recordCount || !assessReport(report).eligible || summary.score !== report.score) return null;
    if (report.ontologyId !== id || report.ontologyVersion !== ontology.version || report.reportVersion !== summary.latestVersion) return null;
    return report.entities.length + report.relations.length ? report : null;
  }

  function store(item,changes = {}) {
    const next = {...item,...changes};
    next.status = status(next);
    records.set(next.id,freeze(next));
    return records.get(next.id);
  }

  function emit(type,id = null) {
    pendingSyncChange = false;
    document.dispatchEvent(new CustomEvent('kg:application-change',{detail:{type,ontologyId:id}}));
  }

  function sameReport(first,second) {
    return Boolean(first && second && first.reportId === second.reportId && first.reportVersion === second.reportVersion &&
      first.ontologyId === second.ontologyId && first.ontologyVersion === second.ontologyVersion);
  }

  function createRecord(id,report) {
    const time = K.now();
    observedReports.set(id,report.reportId);
    return store({id,name:report.ontologyName,description:report.config.description || '',report,
      stage:'draft',live:null,history:[],created:time,updated:time});
  }

  // 报告更新会结束旧申请；新快照必须重新审核，旧 live 保留原版本与启停状态。
  function replaceReport(item,report,current) {
    const time = K.now();
    const history = item.history.map(entry => entry.status === 'pending' ? {...entry,status:'withdrawn',updated:time,
      remark:'质检报告已更新，本次申请已撤回。请基于最新合格报告重新提交。'} : entry);
    observedReports.set(item.id,current.reportId);
    return store(item,{report,stage:'draft',history,updated:time,
      name:current.ontologyName,description:current.config.description || ''});
  }

  function synchronizeRecord(id) {
    const report = reportFor(id), current = latest(id), item = records.get(id);
    if (!item) {
      if (!report) return false;
      createRecord(id,report); return true;
    }
    if (current && observedReports.get(id) !== current.reportId) {
      replaceReport(item,report,current); return true;
    }
    if (report && !sameReport(item.report,report)) {
      store(item,{report,name:report.ontologyName,description:report.config.description || ''}); return true;
    }
    return false;
  }

  function synchronize(notify) {
    if (synchronizing) return;
    synchronizing = true;
    try {
      const ids = [...new Set([...available().map(item => item.id),...records.keys()])];
      let changed = false;
      ids.forEach(id => { if (synchronizeRecord(id)) changed = true; });
      const signature = ids.filter(id => reportFor(id)).sort().join('|');
      changed = signature !== visibleSignature || changed;
      visibleSignature = signature;
      // 读取若先于事件监听完成同步，仍将变化留给下一次显式同步通知。
      pendingSyncChange = pendingSyncChange || changed;
      if (notify && pendingSyncChange) emit('synced');
    } finally { synchronizing = false; }
  }

  /** 返回符合发布条件的图谱；读操作可初始化草稿，不触发重入渲染。 */
  function eligible() {
    synchronize(false);
    return available().map(item => records.get(item.id)).filter(item => item && reportFor(item.id));
  }

  /** 不合格的旧图谱仍可读取发布历史；从未合格且无记录的 id 返回 null。 */
  function get(id) {
    synchronize(false);
    return records.get(id) || null;
  }

  function qualifiedContext(id) {
    const item = get(id), report = reportFor(id);
    if (!report) return {error:'该图谱暂不可发布，请确认本体已启用，且最新质检已完成、达到 95 分、无重大问题并未过期。'};
    if (!item) return {error:'发布记录不存在，请重新进入质检详情。'};
    return {item,report};
  }

  /** 提交冻结当前合格快照；重复、已发布同版和失效报告返回业务错误。 */
  function submit(id) {
    const {item,report,error} = qualifiedContext(id);
    if (error) return failure(error);
    if (item.stage === 'reviewing') return failure('该图谱正在发布审核中，请勿重复提交。');
    if (item.stage === 'published' && sameReport(item.live?.report,report)) return failure('该版本已发布，无需重复提交。');
    const time = K.now(), snapshot = freeze(K.clone(report));
    const entry = {id:K.uid('application-review'),type:item.live ? '版本更新' : '首次发布',status:'pending',
      version:(item.live?.version || 0) + 1,submitted:time,updated:time,remark:'',report:snapshot};
    store(item,{stage:'reviewing',history:[entry,...item.history],updated:time});
    emit('submitted',id); return {ok:true};
  }

  /** 撤回允许处理已暂时失效的申请，保留原申请快照和旧发布版本。 */
  function withdraw(id) {
    const item = get(id), pending = item?.history.find(entry => entry.status === 'pending');
    if (!item || item.stage !== 'reviewing' || !pending) return failure('当前没有可撤回的审核申请。');
    const time = K.now();
    const history = item.history.map(entry => entry.id === pending.id ? {...entry,status:'withdrawn',updated:time,
      remark:'申请人已撤回，可重新提交发布审核。'} : entry);
    store(item,{stage:'draft',history,updated:time});
    emit('withdrawn',id); return {ok:true};
  }

  /** 演示审核前再次核对最新合格报告；驳回需理由，失败不伪造审核结论。 */
  function review(id,approved,remark = '') {
    const {item,report,error} = qualifiedContext(id);
    if (error) return failure(error);
    const pending = item.history.find(entry => entry.status === 'pending');
    if (item.stage !== 'reviewing' || !pending) return failure('当前没有待处理的审核申请，请核对是否已更新报告或撤回。');
    if (!sameReport(pending.report,report)) return failure('质检报告已变化，请撤回后基于最新报告重新提交。');
    if (typeof approved !== 'boolean') return failure('请选择审核通过或驳回。');
    const reason = String(remark ?? '').trim();
    if (!approved && !reason) return failure('请填写驳回理由。');
    if (reason.length > 200) return failure('审核备注请控制在 200 字以内。');
    const time = K.now();
    const history = item.history.map(entry => entry.id === pending.id ? {...entry,status:approved ? 'approved' : 'rejected',updated:time,remark:reason} : entry);
    const live = approved ? {version:pending.version,enabled:item.live ? item.live.enabled : true,report:pending.report} : item.live;
    store(item,{stage:approved ? 'published' : 'rejected',live,history,updated:time});
    emit(approved ? 'approved' : 'rejected',id); return {ok:true};
  }

  function enableError(item) {
    if (item.stage === 'reviewing') return '正在发布审核中，请先完成或撤回审核，再启用已有版本。';
    if (K.qualityUI?.overview(item.id)?.loading) return '当前正在质检，请等待完成后再启用已发布版本。';
    const ontology = available().find(value => value.id === item.id);
    if (!ontology) return '本体当前不可用，请先确认本体已发布并启用。';
    const report = item.live.report;
    if (!report || report.ontologyId !== item.id || report.ontologyVersion !== ontology.version || !assessReport(report).eligible) {
      return '已发布版本不符合 95 分且无重大问题的要求，请重新质检并提交发布审核。';
    }
    if (!K.qualityUI?.isReportStale || K.qualityUI.isReportStale(report)) {
      return '已发布版本的数据或本体定义已变化，请重新质检并提交发布审核后再启用。';
    }
    return '';
  }

  /** 已启用的发布版本可随时停用；重新启用只恢复仍有效的已审核快照，不发布草稿。 */
  function toggle(id) {
    const item = get(id);
    if (!item?.live) return failure('该图谱尚无已发布版本，请先提交发布审核。');
    const error = !item.live.enabled && enableError(item);
    if (error) return failure(error);
    store(item,{live:{...item.live,enabled:!item.live.enabled},updated:K.now()});
    emit(item.live.enabled ? 'disabled' : 'enabled',id); return {ok:true};
  }

  /** 同步质检和可用性变化；仅同步发生变化时通知界面，历史记录不会被删除。 */
  function sync() { synchronize(true); return {ok:true}; }

  /** 通知配套的本地审核样例；只初始化无历史的草稿，绝不覆盖已有操作或发布版本。 */
  function seedReviewExample(id,example) {
    if (!['scenario-application','scenario-drug-prevention'].includes(id)) return failure('非消息审核样例。');
    const {item,report,error} = qualifiedContext(id);
    if (error) return failure(error);
    if (item.history.length || item.live || item.stage !== 'draft') return {ok:true,existing:true};
    if (!['approved','rejected'].includes(example?.status) || !example.remark || !example.updated || !example.submitted) return failure('审核样例不完整。');
    const snapshot = freeze(K.clone(report));
    const entry = {id:'notice-review-' + id,type:'首次发布',status:example.status,version:1,
      submitted:example.submitted,updated:example.updated,remark:example.remark,report:snapshot};
    store(item,{stage:example.status === 'approved' ? 'published' : 'rejected',history:[entry],
      live:example.status === 'approved' ? {version:1,enabled:true,report:snapshot} : null,updated:example.updated});
    emit('example-initialized',id); return {ok:true};
  }

  /** 初始化监听可重复调用；页面仍可在未初始化时通过读取和操作自动复核前置。 */
  function init() {
    if (initialized) return {ok:true};
    initialized = true;
    ['kg:quality-change','kg:results-change','kg:extraction-change'].forEach(type => document.addEventListener(type,sync));
    return sync();
  }

  K.applications = {eligible,get,reportFor,assessReport,submit,withdraw,review,toggle,status,sync,init,seedReviewExample};
})();
