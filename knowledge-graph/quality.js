/* 图谱质检仅计算当前页面中的已确认数据，报告和导出始终引用同一次检测快照。 */
(() => {
  const esc = KG.escape;
  const copy = KG.clone;
  const $ = id => document.getElementById(id);
  const dimensions = [
    {id:'completeness',label:'完整性',problem:'属性缺失'},
    {id:'isolation',label:'孤立性',problem:'孤立实体'},
    {id:'duplicates',label:'重复性',problem:'疑似重复'},
    {id:'consistency',label:'一致性',problem:'约束违反'}
  ];
  const state = {selectedId:null,report:null,loading:false,token:0,zoom:1,filter:'all',focusedIssue:null,detailIssue:null,highlight:true,message:''};
  const reports = new Map();
  const scenarioRuns = new Map();
  const seededScenarios = new Set();
  const historyFor = id => reports.get(id) || [];
  const latestReport = id => historyFor(id)[0] || null;
  let initialized = false;
  let panel = null;
  let mountedReport = '';
  let lockedCreateOntologyId = null;
  const available = () => KG.extract?.ontologies() || [];
  const ontology = () => available().find(item => item.id === state.selectedId);
  // 首检依赖融合完成；历史报告允许重新质检，尚未挂载总览时不放开首检。
  const canInspect = id => historyFor(id).length > 0 || KG.graphCatalog?.workflowState?.('fusion',id) === 'completed';
  const candidates = () => available().filter(item => canInspect(item.id) && !scenarioRuns.has(item.id));
  const immutable = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(immutable);
    return Object.freeze(value);
  };
  const approved = item => item.status === 'approved' && !item.mergedInto;
  const missing = value => value == null || String(value).trim() === '' || (Array.isArray(value) && !value.length);
  const normalized = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const percent = (valid,total) => total ? Math.round(valid / total * 100) : null;

  function propertiesFor(config,record,kind) {
    if (kind === 'relation') return config.relations.find(type => type.id === record.typeId)?.properties || [];
    if (KG.hierarchy?.effective) {
      const inherited = KG.hierarchy.effective(config,record.typeId);
      return Array.isArray(inherited) ? inherited : inherited?.properties || [];
    }
    const chain = [],seen = new Set();
    let type = config.entities.find(value => value.id === record.typeId);
    while (type && !seen.has(type.id)) {
      seen.add(type.id); chain.unshift(type); type = config.entities.find(value => value.id === type.parentId);
    }
    return [...new Map(chain.flatMap(value => value.properties || []).map(property => [property.name,property])).values()];
  }

  /** 类型约束接受自身或子类型，遇到错误继承环时终止遍历。 */
  function acceptsType(config,actualId,expectedId) {
    const seen = new Set();
    let type = config.entities.find(value => value.id === actualId);
    while (type && !seen.has(type.id)) {
      if (type.id === expectedId) return true;
      seen.add(type.id); type = config.entities.find(value => value.id === type.parentId);
    }
    return false;
  }

  function addIssue(report,options) {
    const issue = {id:`quality-issue-${report.issues.length + 1}`,entityIds:[],relationIds:[],...options};
    report.issues.push(issue);
  }

  function labelFor(report,record,kind) {
    if (kind === 'entity') return record.name || '未命名实体';
    const from = report.entities.find(entity => entity.id === record.fromId)?.name || '缺失起点';
    const to = report.entities.find(entity => entity.id === record.toId)?.name || '缺失终点';
    const type = report.config.relations.find(value => value.id === record.typeId)?.name || record.name || '未知关系';
    return `${from} — ${type} → ${to}`;
  }

  function recordIssue(report,record,kind,options) {
    addIssue(report,{kind,recordId:record.id,label:labelFor(report,record,kind),
      entityIds:kind === 'entity' ? [record.id] : [record.fromId,record.toId].filter(Boolean),
      relationIds:kind === 'relation' ? [record.id] : [],...options});
  }

  function checkCompleteness(report) {
    let required = 0,absent = 0;
    const inspect = (record,kind) => {
      const fields = propertiesFor(report.config,record,kind).filter(property => property.required);
      const empty = fields.filter(property => missing(record.properties?.[property.name]));
      required += fields.length; absent += empty.length;
      if (empty.length) recordIssue(report,record,kind,{dimension:'completeness',title:'缺少必填属性',
        description:`未填写：${empty.map(property => property.name).join('、')}。请在来源资料中核对并补充。`});
    };
    report.entities.forEach(record => inspect(record,'entity'));
    report.relations.forEach(record => inspect(record,'relation'));
    return {score:percent(required - absent,required),affected:absent,total:required,
      summary:required ? `${required - absent} / ${required} 项必填属性已填写` : '本体未定义必填属性，不计入综合分',
      formula:'已填写的必填属性数 ÷ 应填写的必填属性数；包含继承属性。'};
  }

  function adjacency(report) {
    const neighbors = new Map(report.entities.map(entity => [entity.id,new Set()]));
    report.relations.forEach(relation => {
      if (!neighbors.has(relation.fromId) || !neighbors.has(relation.toId)) return;
      if (relation.fromId === relation.toId) return;
      neighbors.get(relation.fromId).add(relation.toId);
      neighbors.get(relation.toId).add(relation.fromId);
    });
    return neighbors;
  }

  function checkIsolation(report,neighbors) {
    const isolated = report.entities.filter(entity => neighbors.get(entity.id).size === 0);
    isolated.forEach(entity => recordIssue(report,entity,'entity',{dimension:'isolation',title:'实体尚未建立关联',
      description:'没有连接到其他已确认实体的有效关系，请核对是否遗漏抽取或关联。'}));
    return {score:percent(report.entities.length - isolated.length,report.entities.length),affected:isolated.length,total:report.entities.length,
      summary:`${isolated.length} / ${report.entities.length} 个实体为孤立实体`,formula:'与其它已确认实体有有效关联的实体数 ÷ 实体总数；仅自关联不算外部连接。'};
  }

  function duplicateGroups(records,keyFor) {
    const groups = new Map();
    records.forEach(record => {
      const key = keyFor(record);
      if (!key) return;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(record);
    });
    return [...groups.values()].filter(group => group.length > 1);
  }

  function checkDuplicates(report) {
    const entities = duplicateGroups(report.entities,entity => normalized(entity.name) ? `${entity.typeId}|${normalized(entity.name)}` : '');
    const relations = duplicateGroups(report.relations,relation => `${relation.typeId}|${relation.fromId}|${relation.toId}`);
    entities.forEach(group => recordIssue(report,group[0],'entity',{dimension:'duplicates',title:'同类型实体名称重复',entityIds:group.map(item => item.id),
      description:`${group.length} 条同类型记录名称相同，可能指向同一实体。请前往知识融合确认，不会自动合并。`}));
    relations.forEach(group => recordIssue(report,group[0],'relation',{dimension:'duplicates',title:'相同端点与类型的关系重复',relationIds:group.map(item => item.id),
      description:`相同起点、终点和关系类型出现 ${group.length} 条记录，请核对是否需要合并来源。`}));
    const excess = [...entities,...relations].reduce((count,group) => count + group.length - 1,0);
    const total = report.entities.length + report.relations.length;
    return {score:percent(total - excess,total),affected:excess,total,summary:`${entities.length + relations.length} 组疑似重复，涉及 ${excess} 条多余记录`,
      formula:'（实体与关系总数 − 疑似重复组中超出的记录数）÷ 记录总数；仅作提示，不自动删除。'};
  }

  function validDate(value) {
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
    if (!match) return false;
    const date = new Date(Number(match[1]),Number(match[2]) - 1,Number(match[3]));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
  }

  function validProperty(value,type) {
    if (missing(value)) return true;
    if (/数字|数值|整数/.test(type)) return typeof value !== 'boolean' && Number.isFinite(Number(value)) && (!/整数/.test(type) || Number.isInteger(Number(value)));
    if (/日期|时间/.test(type)) return validDate(value);
    if (/布尔|是否/.test(type)) return [true,false,1,0,'true','false','是','否'].includes(value);
    return typeof value !== 'object';
  }

  function consistencyReasons(report,record,kind) {
    const types = kind === 'entity' ? report.config.entities : report.config.relations;
    const type = types.find(item => item.id === record.typeId);
    const reasons = [];
    if (!type) reasons.push('记录类型不在本次已发布的本体定义中');
    const invalid = propertiesFor(report.config,record,kind).filter(property => !validProperty(record.properties?.[property.name],property.type || '文本'));
    if (invalid.length) reasons.push(`属性格式不符：${invalid.map(property => property.name).join('、')}`);
    if (kind === 'entity' && missing(record.name)) reasons.push('实体名称为空');
    if (kind === 'relation') relationConsistency(report,record,type,reasons);
    return reasons;
  }

  function relationConsistency(report,record,type,reasons) {
    const from = report.entities.find(entity => entity.id === record.fromId);
    const to = report.entities.find(entity => entity.id === record.toId);
    if (!from || !to) reasons.push('关系端点缺失、尚未确认或已合并');
    if (type && from && !acceptsType(report.config,from.typeId,type.from)) reasons.push('起点实体类型不符合本体约束');
    if (type && to && !acceptsType(report.config,to.typeId,type.to)) reasons.push('终点实体类型不符合本体约束');
  }

  function checkConsistency(report) {
    let affected = 0;
    const inspect = (record,kind) => {
      const reasons = consistencyReasons(report,record,kind);
      if (!reasons.length) return;
      affected++;
      recordIssue(report,record,kind,{dimension:'consistency',title:'与本体定义或关联数据不一致',description:`${reasons.join('；')}。`});
    };
    report.entities.forEach(record => inspect(record,'entity'));
    report.relations.forEach(record => inspect(record,'relation'));
    const total = report.entities.length + report.relations.length;
    return {score:percent(total - affected,total),affected,total,summary:`${affected} / ${total} 条记录存在一致性问题`,
      formula:'符合本体类型、关系端点和属性格式约束的记录数 ÷ 记录总数；子类型可以匹配父类型约束。'};
  }

  /** 输入包含本体及结果快照；返回冻结报告，计算不改变实体、关系或本体。 */
  function compute(snapshot) {
    const report = {...copy(snapshot),issues:[],metrics:{}};
    report.entities = (report.entities || []).filter(approved);
    report.relations = (report.relations || []).filter(approved);
    const neighbors = adjacency(report);
    report.metrics.completeness = checkCompleteness(report);
    report.metrics.isolation = checkIsolation(report,neighbors);
    report.metrics.duplicates = checkDuplicates(report);
    report.metrics.consistency = checkConsistency(report);
    const scores = dimensions.map(dimension => report.metrics[dimension.id].score).filter(score => score !== null);
    report.score = scores.length ? Math.round(scores.reduce((sum,score) => sum + score,0) / scores.length) : null;
    return immutable(report);
  }

  function capture(selected) {
    const data = KG.results.forOntology(selected.id);
    return {ontologyId:selected.id,ontologyName:selected.name,ontologyVersion:selected.version,config:copy(selected.config),
      entities:copy(data.entities).filter(approved),relations:copy(data.relations).filter(approved),
      dataVersion:KG.results.version,detectedAt:KG.now()};
  }

  function resultSignature(data) {
    return JSON.stringify({entities:data.entities.filter(approved),relations:data.relations.filter(approved)});
  }

  // 按所属图谱检查过期，其他图谱的处理不会改变当前报告的有效性。
  function reportIsStale(report) {
    if (!report) return false;
    const selected = available().find(item => item.id === report.ontologyId);
    if (!selected || selected.version !== report.ontologyVersion) return true;
    return resultSignature(report) !== resultSignature(KG.results.forOntology(report.ontologyId));
  }

  function isStale() {
    return reportIsStale(state.report);
  }

  /** 历史报告保留当时快照，即使数据未变化也不能据此修改当前结果。 */
  function isHistorical() {
    return Boolean(state.report && state.report !== latestReport(state.report.ontologyId));
  }

  function repairBlocked() {
    return isHistorical() || isStale() || state.loading || KG.applications?.get(state.selectedId)?.stage === 'reviewing';
  }

  /** 卡片只读取所属图谱的最近成功报告；未检测时不提供虚构分数或问题数量。 */
  function overview(id) {
    const report = latestReport(id);
    return {status:report ? 'detected' : 'undetected',score:report?.score ?? null,
      issueCount:report ? report.issues.length : null,detectedAt:report?.detectedAt ?? null,stale:reportIsStale(report),
      recordCount:historyFor(id).length,latestVersion:report?.reportVersion ?? null,
      loading:scenarioRuns.has(id) || (state.loading && state.selectedId === id)};
  }

  function notifyChange(phase,ontologyId = state.selectedId) {
    document.dispatchEvent(new CustomEvent('kg:quality-change',{detail:{ontologyId,phase}}));
  }

  /** 进入指定可用图谱，恢复其报告；无效本体返回 false，不切换到其它图谱。 */
  function selectOntology(id) {
    if (!available().some(item => item.id === id)) return false;
    if (state.selectedId === id && state.loading) return true;
    clearReport(); state.selectedId = id; state.report = latestReport(id);
    if (scenarioRuns.has(id)) {
      const snapshot = scenarioRuns.get(id); scenarioRuns.delete(id);
      if (canInspect(id)) { beginDetection(snapshot,900); return true; }
      state.message = '融合状态已变化，请完成知识融合后重新发起质检。'; notifyChange('failed',id);
    }
    render(); return true;
  }

  function reportFrom(snapshot,version) {
    return compute({...snapshot,reportId:KG.uid('quality-report'),reportVersion:version});
  }

  /** 初始化状态样例；数据与融合必须就绪。重复调用不覆盖用户后续操作，失败不写入记录。 */
  function seedScenario(ontologyId,mode) {
    if (!['completed','running'].includes(mode)) return {ok:false,reason:'不支持的质检样例状态。'};
    if (seededScenarios.has(ontologyId) || historyFor(ontologyId).length || (state.loading && state.selectedId === ontologyId)) return {ok:true,existing:true};
    const selected = available().find(item => item.id === ontologyId);
    if (!selected || !canInspect(ontologyId)) return {ok:false,reason:'本体必须已发布启用，并完成知识融合。'};
    try {
      const snapshot = immutable(capture(selected));
      if (!snapshot.entities.length && !snapshot.relations.length) return {ok:false,reason:'没有可质检的已确认数据。'};
      if (mode === 'completed') {
        const first = reportFrom(snapshot,1),latest = reportFrom(snapshot,2);
        reports.set(ontologyId,[latest,first]);
        if (state.selectedId === ontologyId) state.report = latest;
      } else scenarioRuns.set(ontologyId,snapshot);
      seededScenarios.add(ontologyId); render(); notifyChange(mode === 'running' ? 'started' : 'completed',ontologyId);
      return {ok:true};
    } catch (error) { return {ok:false,reason:'质检样例未能完成计算，未新增报告。'}; }
  }

  function clearReport(message = '') {
    if (state.loading) cancelDetection();
    state.token++; state.loading = false; state.report = null; state.zoom = 1;
    state.filter = 'all'; state.focusedIssue = null; state.detailIssue = null; state.highlight = true; state.message = message;
    $('qualityDetailDialog')?.close();
    $('qualityRepairDialog')?.close();
    $('qualityHistoryDialog')?.close();
  }

  function startDetection() {
    if (state.loading) return;
    const selected = ontology();
    if (!selected || !KG.results) { clearReport('请先选择可用的已发布本体。'); render(); notifyChange('failed'); return; }
    if (!canInspect(selected.id)) {
      state.message = '首次质检前，请先完成该图谱的知识融合。'; render(); notifyChange('failed'); return;
    }
    const snapshot = capture(selected);
    if (!snapshot.entities.length && !snapshot.relations.length) {
      state.message = '该图谱暂无已确认的实体和关系，请先完成知识抽取与融合。'; render(); notifyChange('failed'); return;
    }
    beginDetection(snapshot);
  }

  // 正常任务与进入详情后接续的样例共用实际计算、取消和历史保存流程。
  function beginDetection(snapshot,delay = 360) {
    state.loading = true; state.message = ''; state.token++;
    $('qualityDetailDialog')?.close(); $('qualityRepairDialog')?.close(); $('qualityHistoryDialog')?.close();
    const token = state.token;
    render();
    notifyChange('started',snapshot.ontologyId);
    // 让页面先呈现计算状态；仅计算上述本地快照，不模拟外部服务调用。
    window.setTimeout(() => finishDetection(snapshot,token),delay);
  }

  function cancelDetection() {
    if (!state.loading) return;
    state.token++; state.loading = false;
    state.message = '已取消本次质检，未生成新报告；已有记录保持不变。';
    notifyChange('cancelled');
  }

  function finishDetection(snapshot,token) {
    if (token !== state.token || state.selectedId !== snapshot.ontologyId) return;
    if (!ontology()) { clearReport('本体已禁用或不再可用，请重新选择。'); render(); return; }
    if (!canInspect(snapshot.ontologyId)) {
      state.loading = false; state.message = '融合状态已变化，请完成知识融合后重新发起质检。'; render(); notifyChange('failed'); return;
    }
    try {
      const history = historyFor(snapshot.ontologyId);
      const report = reportFrom(snapshot,history.length + 1);
      reports.set(snapshot.ontologyId,[report,...history]);
      state.report = report; state.zoom = 1; state.filter = 'all'; state.focusedIssue = null;
    } catch (error) {
      state.message = '本次检测未完成，请重试；上次报告与已确认数据均保留。';
    }
    state.loading = false; render();
    if (state.message) KG.notify?.(state.message);
    notifyChange(state.message ? 'failed' : 'completed',snapshot.ontologyId);
  }

  function toolbarMarkup() {
    return `<div class="q-toolbar"><span>仅检测已确认、未合并的实体和关系</span>
      <div class="q-toolbar-actions"><button class="btn" id="qualityHistory" ${!historyFor(state.selectedId).length || state.loading ? 'disabled' : ''}>历史质检记录（${historyFor(state.selectedId).length}）</button>
      ${state.loading ? '<button class="btn" id="qualityCancel">取消质检</button>' : ''}<button class="btn ${state.report ? '' : 'primary'}" id="qualityRun" ${!ontology() || !canInspect(state.selectedId) || state.loading ? 'disabled' : ''}>${state.loading ? '正在检测…' : state.report ? '重新质检' : '执行质检'}</button>${KG.applicationUI?.controls(state.report) || ''}</div></div>`;
  }

  function emptyMarkup(items) {
    const title = state.loading ? '正在计算图谱质量' : !items.length ? '暂无可检测的图谱' : state.message || (state.selectedId && !canInspect(state.selectedId) ? '请先完成知识融合，再发起首次质检' : '执行检测，查看该图谱的质量情况');
    const description = state.loading ? '正在核对必填属性、实体关联、重复数据和本体约束。' : !items.length ? '请先发布并启用一个本体，再完成抽取与融合。' : '检测后将在这里展示实例图谱、各项评分和问题明细。';
    return `<div class="q-empty" data-testid="quality-empty">${state.loading ? '<span class="spinner"></span>' : ''}<h2>${esc(title)}</h2><p>${esc(description)}</p></div>`;
  }

  function metricMarkup(report) {
    return `<section class="q-scores" aria-label="质检评分"><div class="q-total"><span>综合评分</span><strong>${report.score ?? '—'}<small>${report.score === null ? '' : '分'}</small></strong>
      <p>${report.score === null ? '暂无可评分数据' : report.issues.length ? `${report.issues.length} 项待核对问题` : '本次未发现质量问题'}</p></div>
      <div class="q-metrics">${dimensions.map(dimension => {
        const metric = report.metrics[dimension.id];
        return `<button type="button" class="q-metric ${state.filter === dimension.id ? 'active' : ''}" data-quality-filter="${dimension.id}"><span>${dimension.label}</span><strong>${metric.score ?? '—'}</strong>
          <small>${esc(metric.summary)}</small><span class="q-metric-track"><i style="width:${metric.score || 0}%"></i></span></button>`;
      }).join('')}</div></section>`;
  }

  function positions(report) {
    const groups = [...new Set(report.entities.map(entity => entity.typeId))];
    const byId = new Map();
    groups.forEach((typeId,index) => {
      const members = report.entities.filter(entity => entity.typeId === typeId);
      members.forEach((entity,row) => byId.set(entity.id,{x:groups.length === 1 ? 460 : 90 + index * 740 / (groups.length - 1),y:55 + (row + .5) * 275 / members.length}));
    });
    return byId;
  }

  function highlighted(report,focusId) {
    const issues = focusId ? report.issues.filter(issue => issue.id === focusId) : report.issues;
    return {entities:new Set(issues.flatMap(issue => issue.entityIds)),relations:new Set(issues.flatMap(issue => issue.relationIds))};
  }

  function nodeBoxes(report,points) {
    return report.entities.map(entity => {
      const point = points.get(entity.id);
      const halfWidth = Math.max(32,Math.min((entity.name || '').length,11) * 6 + 5);
      return {id:entity.id,left:point.x - halfWidth,right:point.x + halfWidth,top:point.y - 30,bottom:point.y + 48};
    });
  }

  /** 连线避让节点与名称区域，防止跨类型关系穿过中间的业务实体。 */
  function segmentHitsBox(from,to,box) {
    const dx = to.x - from.x,dy = to.y - from.y;
    const directions = [-dx,dx,-dy,dy],distances = [from.x - box.left,box.right - from.x,from.y - box.top,box.bottom - from.y];
    let start = 0,end = 1;
    for (let index = 0; index < 4; index++) {
      if (directions[index] === 0) { if (distances[index] < 0) return false; continue; }
      const ratio = distances[index] / directions[index];
      if (directions[index] < 0) start = Math.max(start,ratio);
      else end = Math.min(end,ratio);
      if (start > end) return false;
    }
    return true;
  }

  function clearRoute(route,boxes) {
    return route.slice(1).every((point,index) => !boxes.some(box => segmentHitsBox(route[index],point,box)));
  }

  function edgeLabel(route,label,boxes) {
    const segments = route.slice(1).map((point,index) => ({from:route[index],to:point,length:Math.hypot(point.x - route[index].x,point.y - route[index].y)}));
    segments.sort((first,second) => second.length - first.length);
    for (const segment of segments) {
      const x = (segment.from.x + segment.to.x) / 2,y = (segment.from.y + segment.to.y) / 2 - 7;
      const halfWidth = label.length * 5 + 8;
      const bounds = {left:x - halfWidth,right:x + halfWidth,top:y - 12,bottom:y + 3};
      if (!boxes.some(box => bounds.left < box.right && bounds.right > box.left && bounds.top < box.bottom && bounds.bottom > box.top)) return {x,y};
    }
    return {x:(route[0].x + route[route.length - 1].x) / 2,y:18};
  }

  function roundedPath(route) {
    let path = `M${route[0].x},${route[0].y}`;
    route.slice(1,-1).forEach((point,index) => {
      const before = route[index],after = route[index + 2];
      const first = Math.hypot(before.x - point.x,before.y - point.y),second = Math.hypot(after.x - point.x,after.y - point.y);
      const radius = Math.min(10,first / 2,second / 2);
      if (!radius) return;
      path += ` L${point.x + (before.x - point.x) * radius / first},${point.y + (before.y - point.y) * radius / first}`;
      path += ` Q${point.x},${point.y} ${point.x + (after.x - point.x) * radius / second},${point.y + (after.y - point.y) * radius / second}`;
    });
    const end = route[route.length - 1];
    return `${path} L${end.x},${end.y}`;
  }

  function routeEdge(report,relation,points,index,label) {
    const from = points.get(relation.fromId),to = points.get(relation.toId);
    const boxes = nodeBoxes(report,points),obstacles = boxes.filter(box => ![relation.fromId,relation.toId].includes(box.id));
    if (from === to) return {path:`M${from.x - 12},${from.y - 16} C${from.x - 58},${from.y - 78} ${from.x + 58},${from.y - 78} ${from.x + 16},${from.y - 15}`,label:{x:from.x,y:from.y - 65},route:[]};
    const direction = to.x >= from.x ? 1 : -1;
    const distance = Math.hypot(to.x - from.x,to.y - from.y);
    const direct = [{x:from.x + (to.x - from.x) / distance * 26,y:from.y + (to.y - from.y) / distance * 26},
      {x:to.x - (to.x - from.x) / distance * 26,y:to.y - (to.y - from.y) / distance * 26}];
    const start = {x:from.x + direction * 26,y:from.y},end = {x:to.x - direction * 26,y:to.y};
    const exit = from.x + direction * 76,entry = to.x - direction * 76;
    const candidates = [direct,...[26 + index % 3 * 14,365,26,40,54].map(y => [start,{x:exit,y:from.y},{x:exit,y},{x:entry,y},{x:entry,y:to.y},end])];
    if (from.x === to.x) candidates.unshift([start,{x:exit,y:from.y},{x:exit,y:to.y},{x:to.x + 26,y:to.y}]);
    const route = candidates.find(candidate => clearRoute(candidate,obstacles)) || candidates[1];
    return {path:roundedPath(route),label:edgeLabel(route,label,boxes),route};
  }

  function edgeMarkup(report,relation,points,marked,index) {
    const from = points.get(relation.fromId),to = points.get(relation.toId);
    if (!from || !to) return '';
    const type = report.config.relations.find(item => item.id === relation.typeId);
    const color = marked ? '#d78335' : '#b8c5d9';
    const label = type?.name || relation.name || '未知关系';
    const route = routeEdge(report,relation,points,index,label);
    return `<g class="q-edge"><title>${esc(labelFor(report,relation,'relation'))}</title><path d="${route.path}" stroke="${color}" stroke-width="${marked ? 2.3 : 1.3}" fill="none" marker-end="url(#qualityArrow)"/>
      <text x="${route.label.x}" y="${route.label.y}" text-anchor="middle" font-size="10" fill="#7d8b9e" stroke="#fbfcfe" stroke-width="4" paint-order="stroke">${esc(label)}</text></g>`;
  }

  function nodeMarkup(report,entity,point,marked,interactive) {
    const type = report.config.entities.find(item => item.id === entity.typeId);
    const color = /^#[0-9a-f]{6}$/i.test(type?.color || '') ? type.color : '#5b8ff9';
    const fullName = entity.name || '未命名实体';
    const shortName = fullName.length > 11 ? `${fullName.slice(0,10)}…` : fullName;
    return `<g class="q-node ${marked ? 'q-node-warning' : ''}" ${interactive ? `role="button" tabindex="0" data-quality-node="${esc(entity.id)}" aria-label="查看实体 ${esc(fullName)}"` : ''}>
      <title>${esc(fullName)} · ${esc(type?.name || '未知类型')}${marked ? ' · 存在待核对问题' : ''}</title>
      <circle cx="${point.x}" cy="${point.y}" r="${marked ? 24 : 22}" fill="#fff" stroke="${marked ? '#d78335' : color}" stroke-width="${marked ? 3 : 1.6}"/>
      <circle cx="${point.x}" cy="${point.y}" r="15" fill="${color}" fill-opacity=".15"/>
      <text x="${point.x}" y="${point.y + 4}" text-anchor="middle" font-size="12" fill="${color}">${esc((type?.name || '实体').slice(0,1))}</text>
      <text x="${point.x}" y="${point.y + 40}" text-anchor="middle" font-size="11" fill="#445267">${esc(shortName)}</text></g>`;
  }

  /** 预览和导出复用同一 SVG 生成器，图中的实例与报告快照一致。 */
  function graphMarkup(report,options = {}) {
    const points = positions(report),marked = highlighted(report,options.focusId);
    const zoom = options.zoom || 1;
    const highlight = options.highlight !== false;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 390" role="img" aria-label="${esc(report.ontologyName)}实例图谱，共${report.entities.length}个实体" class="q-svg">
      <defs><marker id="qualityArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a6b5cb"/></marker></defs>
      <g transform="translate(${460 * (1 - zoom)},${195 * (1 - zoom)}) scale(${zoom})">
      ${report.relations.map((relation,index) => edgeMarkup(report,relation,points,highlight && marked.relations.has(relation.id),index)).join('')}
      ${report.entities.map(entity => nodeMarkup(report,entity,points.get(entity.id),highlight && marked.entities.has(entity.id),options.interactive)).join('')}
      </g></svg>`;
  }

  function graphSection(report) {
    return '<section class="q-explorer-section" id="qualityGraphSection" aria-label="质检图谱浏览"><h2>图谱浏览与核对</h2><p class="help">浏览本次报告中的完整图谱，按条件查询或点击实体探索关联；导出结果与当前查询范围一致。</p><div id="qualityExplorer"></div></section>';
  }

  // 关系列出起止实体，并单独注明关系类型，避免把关系名称误当成实体名称。
  function issueEntities(report,issue) {
    const names = issue.entityIds.map(id => report.entities.find(entity => entity.id === id)?.name || '缺失实体');
    if (issue.kind === 'relation') {
      const relation = report.relations.find(record => record.id === issue.recordId);
      const type = report.config.relations.find(item => item.id === relation?.typeId)?.name || '未知关系';
      return {name:names.join(' → ') || '缺失实体',context:`关系：${type}${issue.relationIds.length > 1 ? ' · '+issue.relationIds.length+' 条记录' : ''}`};
    }
    const entity = report.entities.find(record => record.id === issue.recordId);
    const type = report.config.entities.find(item => item.id === entity?.typeId)?.name || '未知类型';
    return {name:[...new Set(names)].join('、') || issue.label,context:`类型：${type}${issue.entityIds.length > 1 ? ' · '+issue.entityIds.length+' 条记录' : ''}`};
  }

  function issueRows(report,issues,interactive = true) {
    return issues.map(issue => {
      const entities = issueEntities(report,issue);
      return `<tr data-quality-issue-row="${esc(issue.id)}"><td><strong>${esc(entities.name)}</strong><small>${esc(entities.context)}</small></td>
      <td><span class="q-problem-label q-problem-${issue.dimension}">${dimensions.find(dimension => dimension.id === issue.dimension).problem}</span><small>${KG.applications?.assessReport({...report,issues:[issue]}).majorCount ? '重大问题' : '一般提示'}</small></td><td>${esc(issue.description)}${interactive ? '' : '<small>'+actionLabel(issue)+'</small>'}</td>
      ${interactive ? `<td><button class="link-btn" data-quality-detail="${esc(issue.recordId)}" data-quality-kind="${issue.kind}" data-quality-issue="${issue.id}">查看详情</button><button class="link-btn ${issue.dimension === 'isolation' ? 'danger' : ''}" data-quality-action="${esc(issue.id)}" ${repairBlocked() ? `disabled title="${isHistorical() ? '历史版本只读，请查看最新报告或重新质检' : '请等待质检完成，或重新质检后处理'}"` : ''}>${actionLabel(issue)}</button></td>` : ''}</tr>`;
    }).join('');
  }

  function issueSection(report) {
    const issues = state.filter === 'all' ? report.issues : report.issues.filter(issue => issue.dimension === state.filter);
    const filters = [{id:'all',problem:'全部'},...['isolation','duplicates','completeness','consistency'].map(id => dimensions.find(item => item.id === id))];
    return `<section class="q-problems" id="qualityProblems"><header><h2>问题明细 <span>共 ${report.issues.length} 项</span></h2></header>
      <nav class="q-problem-tabs" aria-label="筛选质检问题类型">${filters.map(filter => {
        const count = filter.id === 'all' ? report.issues.length : report.issues.filter(issue => issue.dimension === filter.id).length;
        return `<button type="button" data-quality-filter="${filter.id}" aria-pressed="${state.filter === filter.id}" class="${state.filter === filter.id ? 'active' : ''}">${filter.problem}<span>（${count}）</span></button>`;
      }).join('')}</nav>
      ${issues.length ? `<div class="q-table-wrap"><table aria-label="质检问题明细"><thead><tr><th scope="col">涉及实体</th><th scope="col">问题类型</th><th scope="col">问题详情</th><th scope="col">操作</th></tr></thead><tbody>${issueRows(report,issues)}</tbody></table></div>` :
        `<div class="q-no-issues">${state.filter === 'all' ? '本次未发现质量问题。' : '本次检测未发现这类问题。'}</div>`}</section>`;
  }

  function scoringRules(report) {
    return `<details class="q-method"><summary>查看检测口径与评分说明</summary><p>综合评分为适用指标的平均值，四舍五入；各项分数越高表示问题越少。无可检查项的指标不计入综合分。</p>
      <ul>${dimensions.map(dimension => `<li><strong>${dimension.label}：</strong>${esc(report.metrics[dimension.id].formula)}</li>`).join('')}</ul>
      <p>只检测本次快照中的已确认数据，不含待确认、已驳回及已合并记录。疑似重复属于需人工核对的提示。</p><p>发布建议：最新有效报告达到 95–100 分，且无重大问题时，可核对后提交。必填属性缺失、类型或关联约束错误属于重大问题；孤立实体与疑似重复通常为一般提示，需结合来源判断是否影响使用。被明确标记为高风险的问题同样阻止提交。</p></details>`;
  }

  function reportMarkup(report) {
    return `<article class="q-report" data-testid="quality-report"><header class="q-report-head"><div><h2>${esc(report.ontologyName)} · 质检报告 V${report.reportVersion}</h2><p>本体 v${report.ontologyVersion} · 检测时间 ${esc(report.detectedAt)} · ${isHistorical() ? '历史版本' : '最新报告'}</p></div></header>
      ${isHistorical() ? `<div class="q-history-notice" role="status"><span>正在查看历史报告 V${report.reportVersion}，仅供回溯与导出，不能用于修改当前数据。</span><button class="link-btn" id="qualityLatest" ${state.loading ? 'disabled' : ''}>查看最新报告 V${latestReport(report.ontologyId).reportVersion}</button></div>` : ''}
      ${!isHistorical() && isStale() ? '<div class="q-stale" role="status">图谱数据或本体定义已变化。当前仍展示上次检测快照，请重新质检以查看最新结果。</div>' : ''}
      ${state.message ? `<div class="q-stale" role="status">${esc(state.message)}</div>` : ''}
      ${state.loading ? '<div class="q-running" role="status"><span class="spinner"></span>正在重新检测，完成前保留上一份报告。</div>' : ''}
      ${metricMarkup(report)}${KG.applicationUI?.assessment(report) || ''}${graphSection(report)}${issueSection(report)}${scoringRules(report)}</article>`;
  }

  function render() {
    panel = panel || $('qualityPanel');
    if (!panel) return;
    if (state.loading && KG.pageTab && (KG.pageTab !== 'quality' || (KG.pageGraphId && KG.pageGraphId !== state.selectedId))) cancelDetection();
    const items = available();
    scenarioRuns.forEach((snapshot,id) => {
      if (items.some(item => item.id === id) && canInspect(id)) return;
      scenarioRuns.delete(id); notifyChange('cancelled',id);
    });
    if (state.selectedId && !items.some(item => item.id === state.selectedId)) {
      clearReport('所选本体已禁用或不再可用，请重新选择。'); state.selectedId = '';
    }
    // 同份报告保留查询、探索、缩放及滚动状态，评分和发布状态独立刷新。
    const active = KG.pageTab === 'quality' && KG.pageGraphId === state.selectedId && state.report;
    const retained = active && mountedReport === state.report.reportId ? $('qualityExplorer') : null;
    if (retained) retained.remove();
    else { KG.applicationExplorer?.clear(); mountedReport = ''; }
    panel.innerHTML = `${toolbarMarkup()}${state.report ? reportMarkup(state.report) : emptyMarkup(items)}`;
    if (retained) $('qualityExplorer').replaceWith(retained);
    else if (active && KG.applicationExplorer?.mount($('qualityExplorer'),state.report)) mountedReport = state.report.reportId;
  }

  function renderGraph() {
    if (!state.report || !$('qualityGraph')) return;
    $('qualityGraph').innerHTML = graphMarkup(state.report,{interactive:true,zoom:state.zoom,highlight:state.highlight,focusId:state.focusedIssue});
    $('qualityZoom').textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function detailMarkup(report,record,kind) {
    const types = kind === 'entity' ? report.config.entities : report.config.relations;
    const type = types.find(value => value.id === record.typeId)?.name || '未知类型';
    const properties = Object.entries(record.properties || {});
    const sources = record.sources || [];
    return `<p class="q-detail-snapshot">以下信息来自质检报告 V${report.reportVersion}，检测时间 ${esc(report.detectedAt)}。${isHistorical() ? '历史版本只读。' : ''}</p><dl class="q-detail-facts"><dt>${kind === 'entity' ? '实体' : '关系'}</dt><dd>${esc(labelFor(report,record,kind))}</dd><dt>类型</dt><dd>${esc(type)}</dd><dt>置信度</dt><dd>${esc(record.confidence ?? '暂无')}${record.confidence == null ? '' : '%'}</dd></dl>
      <h3>属性</h3>${properties.length ? `<dl class="q-detail-facts">${properties.map(([name,value]) => `<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>` : '<p class="help">暂无属性信息</p>'}
      <h3>来源依据</h3>${sources.length ? sources.map(source => `<section class="q-source"><strong>${esc(source.title || '未命名文档')}${source.page ? ` · 第 ${esc(source.page)} 页` : ''}</strong><p>${esc(source.quote || '暂无原文片段')}</p></section>`).join('') : '<p class="help">暂无来源信息，请在知识融合中核对。</p>'}`;
  }

  function openDetail(id,kind = 'entity',issueId = null) {
    const report = state.report;
    if (!report) return;
    const records = kind === 'entity' ? report.entities : report.relations;
    const record = records.find(value => value.id === id);
    if (!record) return;
    $('qualityDetailTitle').textContent = kind === 'entity' ? '实体详情' : '关系详情';
    $('qualityDetailContent').innerHTML = detailMarkup(report,record,kind);
    const related = report.issues.filter(issue => (kind === 'entity' ? issue.entityIds : issue.relationIds).includes(id));
    state.detailIssue = (related.find(issue => issue.id === issueId) || related[0])?.id || null;
    const issue = report.issues.find(issue => issue.id === state.detailIssue);
    if (issue) KG.applicationExplorer?.focusIssue?.(issue);
    $('qualityDetailAction').hidden = !issue;
    $('qualityDetailAction').disabled = repairBlocked();
    $('qualityDetailAction').title = KG.applications?.get(state.selectedId)?.stage === 'reviewing' ? '请先撤回发布审核，再修改当前图谱' : '';
    $('qualityDetailAction').textContent = issue ? actionLabel(issue) : '';
    if (!$('qualityDetailDialog').open) $('qualityDetailDialog').showModal();
  }

  const actionLabel = issue => ({isolation:'建议删除',duplicates:'建议合并',completeness:'建议补充',consistency:'建议修改'}[issue.dimension]);

  function handleClick(event) {
    const button = event.target.closest('button,[data-quality-node]');
    if (!button) return;
    if (button.id === 'qualityRun') requestDetection();
    if (button.id === 'qualityCancel') { cancelDetection(); render(); }
    if (button.id === 'qualityHistory') openHistory();
    if (button.id === 'qualityLatest') selectOntology(state.selectedId);
    if (button.dataset.qualityNode) openDetail(button.dataset.qualityNode);
    if (button.dataset.qualityDetail) openDetail(button.dataset.qualityDetail,button.dataset.qualityKind,button.dataset.qualityIssue);
    if (button.dataset.qualityAction) KG.qualityActions.open(button.dataset.qualityAction);
    if (button.dataset.qualityFilter) { state.filter = button.dataset.qualityFilter; render(); $('qualityProblems').scrollIntoView({behavior:'smooth',block:'nearest'}); }
    if (button.dataset.qualityZoom) changeZoom(button.dataset.qualityZoom);
  }

  function changeZoom(direction) {
    state.zoom = direction === 'reset' ? 1 : Math.max(.6,Math.min(2.2,state.zoom + (direction === 'in' ? .2 : -.2)));
    if (direction === 'reset') state.focusedIssue = null;
    renderGraph();
  }

  function requestDetection() {
    if (KG.applications?.get(state.selectedId)?.stage !== 'reviewing') { startDetection(); return; }
    KG.confirm({title:'重新质检并更新待审核内容？',text:'生成新报告后，当前审核申请将撤回，新报告需重新提交审核。已发布版本保持不变。',
      label:'确认重新质检',action:startDetection});
  }

  function handleChange(event) {
    if (event.target.id === 'qualityHighlight') { state.highlight = event.target.checked; state.focusedIssue = null; renderGraph(); }
  }

  const exportStyles = `body{font:14px/1.65 "Microsoft YaHei",Arial,sans-serif;color:#323847;max-width:1180px;margin:36px auto;padding:0 24px}h1{font-size:24px}h2{font-size:18px}p{color:#6b778b}svg{width:100%;background:#fbfcfe;border:1px solid #e5e9f2;border-radius:8px}table{width:100%;border-collapse:collapse;margin:16px 0;table-layout:fixed}th,td{border:1px solid #e5e9f2;padding:10px;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{background:#f7f8fb}td small{display:block;color:#7c8597;margin-top:5px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{border:1px solid #e5e9f2;border-radius:6px;padding:12px}.metric strong{display:block;font-size:26px;color:#3f6fff}.metric small{color:#7c8597}.summary{padding:15px;background:#f5f8ff;border:1px solid #dce6fa}.summary b{font-size:26px;color:#3f6fff}footer{margin-top:30px;border-top:1px solid #e5e9f2;padding-top:12px;color:#7c8597}@media print{body{margin:10px;padding:0}svg{max-height:330px}tr,.metric{break-inside:avoid}}`;

  /** 独立 HTML 不依赖脚本、网络或当前页面样式，所有业务文本均转义。 */
  function buildExport(report) {
    const metricRows = dimensions.map(dimension => `<div class="metric">${dimension.label}<strong>${report.metrics[dimension.id].score ?? '—'}</strong><small>${esc(report.metrics[dimension.id].summary)}</small></div>`).join('');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${esc(report.ontologyName)} · 图谱质检报告 V${report.reportVersion || 1}</title><style>${exportStyles}</style></head><body>
      <h1>${esc(report.ontologyName)} · 图谱质检报告 V${report.reportVersion || 1}</h1><p>本体 v${report.ontologyVersion} · 检测时间 ${esc(report.detectedAt)} · ${report.entities.length} 个实体 / ${report.relations.length} 条关系</p>
      <div class="summary">综合评分 <b>${report.score ?? '—'}</b>${report.score === null ? '' : '分'} · ${report.issues.length} 项待核对问题</div><h2>检测指标</h2><div class="metrics">${metricRows}</div>
      <h2>图谱实例预览</h2>${graphMarkup(report,{interactive:false,highlight:true})}<p>橙色边框表示待核对问题；图谱来自本次检测快照。端点缺失的关系不绘制连线。</p>
      <h2>问题明细</h2>${report.issues.length ? `<table><thead><tr><th style="width:30%">涉及实体</th><th style="width:15%">问题类型</th><th>问题详情与建议</th></tr></thead><tbody>${issueRows(report,report.issues,false)}</tbody></table>` : '<p>本次未发现质量问题。</p>'}
      <h2>检测口径</h2><p>综合分为适用指标平均值；无检查项的指标不参与平均。仅检测已确认且未合并的数据，疑似重复须由人工核对。</p><ul>${dimensions.map(dimension => `<li>${dimension.label}：${esc(report.metrics[dimension.id].formula)}</li>`).join('')}</ul>
      <footer>本报告由知识图谱产品原型中的示例数据计算。报告固定保留检测时内容，后续数据变更不自动更新本报告。</footer></body></html>`;
  }

  function downloadReport(report = state.report) {
    if (!report || state.loading) return;
    const url = URL.createObjectURL(new Blob([buildExport(report)],{type:'text/html;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.ontologyName.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,50)}-质检报告-V${report.reportVersion}-${report.detectedAt.slice(0,10)}.html`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url),1000);
    KG.notify?.(`已导出质检报告 V${report.reportVersion}，包含图谱、评分与问题明细。`);
  }

  function historyRows() {
    return historyFor(state.selectedId).map((report,index) => `<tr><td><strong>V${report.reportVersion}</strong>${index === 0 ? '<span class="q-latest-tag">最新</span>' : ''}</td><td>${esc(report.detectedAt)}<small>本体 v${report.ontologyVersion}</small></td><td>${report.score ?? '—'}</td><td>${report.issues.length} 项</td><td><button class="link-btn" data-quality-view="${report.reportVersion}">查看报告</button><button class="link-btn" data-quality-download="${report.reportVersion}">导出</button></td></tr>`).join('');
  }

  function openHistory() {
    if (!state.selectedId || state.loading) return;
    const history = historyFor(state.selectedId);
    $('qualityHistorySummary').textContent = `${ontology()?.name || history[0]?.ontologyName || '当前图谱'} · 共 ${history.length} 次成功质检`;
    $('qualityHistoryContent').innerHTML = history.length ? `<div class="q-history-table-wrap"><table class="q-history-table"><thead><tr><th>报告版本</th><th>质检时间 / 本体版本</th><th>综合分</th><th>问题数</th><th>操作</th></tr></thead><tbody>${historyRows()}</tbody></table></div>` : '<div class="q-no-issues">暂无质检记录，执行质检后会在这里保留成功报告。</div>';
    $('qualityHistoryDialog').showModal();
  }

  function viewHistory(version) {
    if (state.loading) return;
    const report = historyFor(state.selectedId).find(item => item.reportVersion === Number(version));
    if (!report) return;
    clearReport(); state.report = report; render();
    $('qualityPanel').scrollIntoView({block:'start'});
  }

  function createSummary() {
    const selected = available().find(item => item.id === $('qualityCreateOntology').value);
    const summary = $('qualityCreateSummary');
    $('qualityCreateError').hidden = true;
    if (!selected) {
      summary.textContent = candidates().length ? '请选择本体，确认当前可检测的数据范围。' : '暂无可质检的本体。首次质检需先完成知识融合；已有质检记录的本体可重新质检。';
      $('qualityCreateSubmit').disabled = true; return;
    }
    if (!canInspect(selected.id)) {
      summary.textContent = '首次质检前，请先完成该图谱的知识融合。'; $('qualityCreateSubmit').disabled = true; return;
    }
    const data = KG.results.forOntology(selected.id), entities = data.entities.filter(approved).length, relations = data.relations.filter(approved).length;
    summary.textContent = entities + relations ? `将检测 ${entities} 个实体、${relations} 条关系，成功后生成质检报告 V${historyFor(selected.id).length + 1}。本体版本为 v${selected.version}。` : '该本体暂无已确认的实体和关系，请先完成知识抽取与融合；不会生成空报告。';
    $('qualityCreateSubmit').disabled = !(entities + relations);
  }

  /** 有 id 时仅为对应卡片发起质检；无 id 时恢复自由选择，不回退到其它本体。 */
  function openCreate(ontologyId) {
    if (state.loading) { KG.notify?.('当前质检正在执行，请等待完成或取消后重试。'); return; }
    if (document.querySelector('dialog[open]')) { KG.notify?.('请先关闭当前弹窗，再发起质检。'); return; }
    const selectable = candidates(), scoped = ontologyId !== undefined;
    const target = scoped ? selectable.find(item => item.id === ontologyId) : null;
    if (scoped && !target) { KG.notify?.('该图谱暂不可质检，请确认本体已发布启用，并已完成知识融合。'); return; }
    lockedCreateOntologyId = scoped ? ontologyId : null;
    const items = scoped ? [target] : selectable;
    $('qualityCreateOntology').innerHTML = (scoped ? '' : '<option value="">请选择本体</option>') + items.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · 本体 v${item.version}</option>`).join('');
    $('qualityCreateOntology').value = lockedCreateOntologyId || '';
    $('qualityCreateOntology').disabled = scoped || !items.length;
    createSummary(); $('qualityCreateDialog').showModal();
    (scoped ? $('qualityCreateSubmit') : $('qualityCreateOntology')).focus();
  }

  function submitCreate(event) {
    event.preventDefault();
    if (lockedCreateOntologyId !== null && $('qualityCreateOntology').value !== lockedCreateOntologyId) {
      $('qualityCreateError').textContent = '本次质检仅针对所选图谱，请关闭后重新从对应卡片发起。'; $('qualityCreateError').hidden = false; return;
    }
    const selected = available().find(item => item.id === $('qualityCreateOntology').value);
    if (!selected) { $('qualityCreateError').textContent = '请选择当前已发布并启用的本体。'; $('qualityCreateError').hidden = false; return; }
    if (!canInspect(selected.id)) { createSummary(); return; }
    const data = KG.results.forOntology(selected.id);
    if (![...data.entities,...data.relations].some(approved)) { createSummary(); return; }
    $('qualityCreateDialog').close(); KG.navigateGraph('quality',selected.id);
    if (KG.pageTab !== 'quality' || KG.pageGraphId !== selected.id) return;
    selectOntology(selected.id); startDetection();
  }

  function mountRecordDialogs() {
    const create = document.createElement('dialog');
    create.id = 'qualityCreateDialog'; create.className = 'q-create-dialog'; create.setAttribute('aria-labelledby','qualityCreateTitle');
    create.innerHTML = '<form class="dialog-layout" id="qualityCreateForm" novalidate><header class="dialog-header"><h2 id="qualityCreateTitle">发起图谱质检</h2><button class="close" type="button" data-quality-create-close aria-label="关闭发起质检">×</button></header><div class="dialog-body"><p class="q-repair-note">选择本体，对当前已确认的数据进行质检。每次成功检测都会保留一份独立报告。</p><label class="q-create-field" for="qualityCreateOntology">检测本体<select id="qualityCreateOntology" required></select></label><p class="q-create-summary" id="qualityCreateSummary" role="status"></p><p class="form-error" id="qualityCreateError" role="alert" hidden></p></div><footer class="dialog-footer"><button class="btn" type="button" data-quality-create-close>取消</button><button class="btn primary" type="submit" id="qualityCreateSubmit">执行质检</button></footer></form>';
    document.body.appendChild(create);
    create.addEventListener('click',event => { if (event.target.closest('[data-quality-create-close]')) create.close(); });
    $('qualityCreateOntology').addEventListener('change',createSummary);
    $('qualityCreateForm').addEventListener('submit',submitCreate);
    mountHistoryDialog();
  }

  function mountHistoryDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'qualityHistoryDialog'; dialog.className = 'q-history-dialog'; dialog.setAttribute('aria-labelledby','qualityHistoryTitle');
    dialog.innerHTML = '<div class="dialog-layout"><header class="dialog-header"><div><h2 id="qualityHistoryTitle">历史质检记录</h2><p id="qualityHistorySummary"></p></div><button class="close" data-quality-history-close aria-label="关闭质检记录">×</button></header><div class="dialog-body"><p class="q-repair-note">报告版本按成功质检次数递增，与本体发布版本分别记录。历史版本只读，可查看和导出。</p><div id="qualityHistoryContent"></div></div><footer class="dialog-footer"><span class="footer-note">仅保留本页演示记录，刷新后重置。</span><button class="btn" data-quality-history-close>关闭</button></footer></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-quality-history-close')) dialog.close();
      if (button.dataset.qualityView) viewHistory(button.dataset.qualityView);
      if (button.dataset.qualityDownload) downloadReport(historyFor(state.selectedId).find(report => report.reportVersion === Number(button.dataset.qualityDownload)));
    });
  }

  function mountDetail() {
    if ($('qualityDetailDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'qualityDetailDialog'; dialog.className = 'q-detail-dialog'; dialog.setAttribute('aria-labelledby','qualityDetailTitle');
    dialog.innerHTML = '<div class="dialog-layout"><header class="dialog-header"><h2 id="qualityDetailTitle">实体详情</h2><button type="button" class="close" data-quality-close aria-label="关闭详情">×</button></header><div class="dialog-body" id="qualityDetailContent"></div><footer class="dialog-footer"><button class="btn" data-quality-close>关闭</button><button class="btn primary" id="qualityDetailAction">查看抽取结果</button></footer></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event => {
      if (event.target.closest('[data-quality-close]')) dialog.close();
      if (event.target.closest('#qualityDetailAction')) { dialog.close(); KG.qualityActions.open(state.detailIssue); }
    });
  }

  function init() {
    if (initialized) return;
    panel = $('qualityPanel');
    if (!panel) return;
    initialized = true; mountDetail(); mountRecordDialogs();
    panel.addEventListener('click',handleClick); panel.addEventListener('change',handleChange);
    panel.addEventListener('keydown',event => {
      const node = event.target.closest('[data-quality-node]');
      if (node && ['Enter',' '].includes(event.key)) { event.preventDefault(); openDetail(node.dataset.qualityNode); }
    });
    document.addEventListener('kg:results-change',() => { if (state.report) render(); });
    render();
  }

  // 跨模块只读最新成功快照，不受质检页当前查看的历史版本影响。
  KG.qualityUI = {init,render,selectOntology,overview,openCreate,openHistory,viewHistory,seedScenario,compute,buildExport,latestReport,getReport:() => state.report,isStale,isHistorical,isReportStale:reportIsStale,
    canRepair:() => Boolean(state.report && !repairBlocked()),propertiesFor,consistencyReasons,validProperty,missing,actionLabel};
})();
