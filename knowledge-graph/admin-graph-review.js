(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  if (!$('graphReviewRows')) return;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const typeNames = {
    ontology_publish: '本体发布', ontology_change: '本体变更',
    graph_publish: '图谱发布', graph_change: '图谱变更'
  };
  const statusNames = {pending: '待审核', rejected: '已驳回', approved: '已通过', cancelled: '已取消'};
  const domains = [
    {
      name: '国企党校培训', description: '梳理国企党校培训的知识体系、模块与知识点，呈现重点学习内容、适用人群及考核方式，帮助按学习需求查找知识。内容均为原型示例。',
      entities: [
        {name: '知识体系', properties: [{name: '名称', type: '文本', description: '学习知识体系的名称，例如：国企党校培训知识体系（示例）。'}, {name: '知识范围', type: '文本', description: '体系覆盖的学习范围，例如：理论基础、党性教育与纪律意识、党建实务、企业治理与履职能力。'}, {name: '培养目标', type: '文本', description: '学习体系希望形成的整体能力，例如：理解理论知识，并联系岗位实践提升履职能力。'}]},
        {name: '知识模块', properties: [{name: '名称', type: '文本', description: '知识体系中的模块名称，例如：党建实务。'}, {name: '学习目标', type: '文本', description: '该模块希望学习者掌握的能力，例如：掌握党支部工作方法，并结合岗位理解党建与生产经营融合。'}, {name: '学习顺序', type: '数字', description: '模块在示例体系中的建议学习顺序，例如：3。'}]},
        {name: '知识点', properties: [{name: '名称', type: '文本', description: '可独立学习的知识内容名称，例如：纪律规矩与廉洁履职。'}, {name: '内容摘要', type: '文本', description: '该知识点包含的具体内容，例如：纪律意识、廉洁履职常见风险及日常行为辨析。'}, {name: '学习重点', type: '文本', description: '必填属性，用于说明需要着重理解和运用的内容，例如：识别岗位中的廉洁风险，并说明恰当的处理思路。'}, {name: '掌握要求', type: '文本', description: '学习后期望达到的理解或应用程度，例如：能结合岗位案例提出风险防范建议。'}]},
        {name: '学习人群', properties: [{name: '名称', type: '文本', description: '建议学习的人群，例如：全体党员、党务工作人员、中层管理人员、青年骨干。'}, {name: '岗位特点', type: '文本', description: '人群的工作职责或成长特点，例如：党务工作人员承担基层组织日常工作。'}, {name: '学习目标', type: '文本', description: '面向人群的学习目标，例如：结合党支部工作规范改进日常党务工作。'}]},
        {name: '考核方式', properties: [{name: '名称', type: '文本', description: '检查学习效果的方式，例如：专题测验、案例分析报告、情景实操、学习成果交流。'}, {name: '考核内容', type: '文本', description: '该考核关注的知识或能力，例如：知识理解、问题辨析与岗位应用。'}, {name: '成果形式', type: '文本', description: '完成考核所需提交或展示的内容，例如：包含问题识别、分析依据及改进建议的案例分析报告。'}, {name: '评价要点', type: '文本', description: '评价学习成果时关注的方面，例如：理解准确、逻辑清楚、建议可行。'}]}
      ],
      relations: [
        {name: '包含模块', from: '知识体系', to: '知识模块', properties: [{name: '模块定位', type: '文本', description: '说明模块在体系中的作用，例如：理论基础为后续学习提供基本认识。'}, {name: '学习顺序', type: '数字', description: '体系中建议的模块学习顺序，例如：1。'}]},
        {name: '涵盖知识点', from: '知识模块', to: '知识点', properties: [{name: '内容定位', type: '文本', description: '说明知识点在模块中的位置，例如：党支部工作规范是党建实务的基础内容。'}, {name: '学习顺序', type: '数字', description: '模块内建议的知识点学习顺序，例如：1。'}]},
        {name: '重点学习', from: '学习人群', to: '知识点', properties: [{name: '学习侧重', type: '文本', description: '说明该人群学习此知识点的重点，例如：中层管理人员关注公司治理与科学决策中的岗位职责。'}, {name: '掌握要求', type: '文本', description: '面向该人群的建议掌握程度，例如：能结合职责分析决策案例并提出改进建议。'}]},
        {name: '学习模块', from: '学习人群', to: '知识模块', properties: [{name: '学习目标', type: '文本', description: '说明该模块对人群的学习价值，例如：中层管理人员通过企业治理与履职能力模块理解企业运行。'}, {name: '学习建议', type: '文本', description: '适合该人群的学习方法，例如：先理解基本概念，再结合岗位案例研讨。'}]},
        {name: '采用考核', from: '学习人群', to: '考核方式', properties: [{name: '考核目的', type: '文本', description: '说明该人群采用此方式的目的，例如：通过情景实操检查党务工作人员运用工作规范的能力。'}, {name: '成果要求', type: '文本', description: '面向该人群的成果要求，例如：完成模拟组织工作任务并解释处理步骤。'}]},
        {name: '检验知识', from: '考核方式', to: '知识点', properties: [{name: '考查重点', type: '文本', description: '说明考核如何检验知识掌握情况，例如：案例分析报告关注风险防控与合规意识的实际运用。'}, {name: '评价说明', type: '文本', description: '说明与该知识点相关的评价依据，例如：风险识别完整、分析有据、建议与情境相符。'}]}
      ],
      changes: ['将培训示例调整为知识体系、知识模块、知识点、学习人群和考核方式五类实体。', '补充知识点的学习内容与重点，并建立适用人群和考核方式的关联。', '更新知识体系框架、学习内容及考核说明的示例来源文档。'],
      entitiesCount: 23, relationsCount: 44, documentCount: 3
    },
    {
      name: '禁毒领域', description: '整理禁毒科普概念、风险表现和预防措施，帮助使用者查找有据可循的宣传教育知识。',
      entities: [
        {name: '科普主题', properties: [{name: '主题名称', type: '文本', description: '使用规范的科普主题名称，例如：青少年禁毒教育。'}, {name: '主题别名', type: '文本', description: '资料中对同一主题的其他称呼，例如：青少年禁毒科普。'}]},
        {name: '风险表现', properties: [{name: '表现名称', type: '文本', description: '宣传资料中记录的风险表现名称，例如：陌生人诱导尝试。'}, {name: '表现说明', type: '文本', description: '引用资料描述该风险表现，例如：以好奇体验为由进行诱导。'}]},
        {name: '预防措施', properties: [{name: '措施名称', type: '文本', description: '宣传资料中的措施名称，例如：识别并拒绝不明物品。'}, {name: '适用对象', type: '文本', description: '措施面向的人群，例如：在校学生。'}]},
        {name: '教育活动', properties: [{name: '活动名称', type: '文本', description: '宣传教育活动的名称，例如：校园禁毒主题课堂。'}, {name: '活动日期', type: '日期', description: '宣传教育活动的举办日期，例如：2026-06-26。'}]}
      ],
      relations: [
        {name: '包含风险', from: '科普主题', to: '风险表现', properties: [{name: '关联说明', type: '文本', description: '说明该主题涉及的风险内容，例如：课程包含防范陌生人诱导的案例。'}, {name: '来源章节', type: '文本', description: '资料中介绍该风险的章节，例如：第二章·风险识别。'}]},
        {name: '建议措施', from: '风险表现', to: '预防措施', properties: [{name: '适用说明', type: '文本', description: '说明使用条件，例如：校内宣传课堂。'}, {name: '来源文档', type: '文本', description: '记录提出该措施的具体资料，例如：校园禁毒教育手册（示例）。'}]},
        {name: '围绕主题', from: '教育活动', to: '科普主题', properties: [{name: '讲解方式', type: '文本', description: '活动介绍该主题的方式，例如：案例讲解与互动问答。'}, {name: '主题时长', type: '数字', description: '该活动用于此主题的分钟数，例如：30。'}]}
      ],
      changes: ['规范科普主题别名，合并重复的主题记录。', '补充预防措施的适用对象及来源文档。', '新增教育活动与科普主题的关联。'],
      entitiesCount: 96, relationsCount: 184, documentCount: 12
    },
    {
      name: '生物医药', description: '建立研究项目、研究机构与文献之间的关联，支持研究资料检索和成果梳理。',
      entities: [
        {name: '研究项目', properties: [{name: '项目名称', type: '文本', description: '项目的正式名称，例如：生物材料研究项目。'}, {name: '项目编号', type: '文本', description: '项目管理资料中的编号，例如：BIO-2026-001。'}]},
        {name: '研究机构', properties: [{name: '机构名称', type: '文本', description: '文献记录的机构全称，例如：示例研究院。'}, {name: '机构简称', type: '文本', description: '该机构在资料中的简称，例如：示例院。'}]},
        {name: '研究人员', properties: [{name: '人员姓名', type: '文本', description: '项目材料中记录的人员姓名，例如：张研究员（示例）。'}, {name: '研究方向', type: '文本', description: '该人员的主要研究方向，例如：生物材料。'}]},
        {name: '文献', properties: [{name: '文献标题', type: '文本', description: '文献的完整标题，例如：生物材料研究进展（示例）。'}, {name: '发表年份', type: '数字', description: '文献的发表年份，例如：2025。'}]}
      ],
      relations: [
        {name: '承担项目', from: '研究机构', to: '研究项目', properties: [{name: '承担角色', type: '文本', description: '该机构在项目中的职责，例如：牵头单位。'}, {name: '承担起始日期', type: '日期', description: '机构开始承担该项目的日期，例如：2026-01-15。'}]},
        {name: '参与项目', from: '研究人员', to: '研究项目', properties: [{name: '参与角色', type: '文本', description: '该人员在项目中的角色，例如：项目成员。'}, {name: '参与起始日期', type: '日期', description: '该人员加入项目的日期，例如：2026-02-01。'}]},
        {name: '引用文献', from: '研究项目', to: '文献', properties: [{name: '引用用途', type: '文本', description: '该项目引用文献的用途，例如：梳理研究背景。'}, {name: '引用位置', type: '文本', description: '项目资料中的具体引用位置，例如：研究方案第二节。'}]}
      ],
      changes: ['新增“研究人员”实体类型。', '补充参与项目关系及参与角色属性。', '校对研究机构的规范名称与文献引用。'],
      entitiesCount: 215, relationsCount: 386, documentCount: 27
    },
    {
      name: '企业制度与流程', description: '连接企业制度、业务流程、职责部门与表单，帮助员工快速查找制度依据和办理路径。',
      entities: [
        {name: '制度', properties: [{name: '制度名称', type: '文本', description: '有效制度的正式名称，例如：采购管理办法。'}, {name: '生效日期', type: '日期', description: '制度开始生效的日期，例如：2026-01-01。'}]},
        {name: '业务流程', properties: [{name: '流程名称', type: '文本', description: '业务办理流程的名称，例如：采购申请流程。'}, {name: '办理时限', type: '数字', description: '以工作日计的办理时限，例如：3。'}]},
        {name: '职责部门', properties: [{name: '部门名称', type: '文本', description: '负责办理业务的部门全称，例如：综合管理部。'}, {name: '职责说明', type: '文本', description: '部门的主要职责，例如：受理日常采购申请。'}]},
        {name: '表单', properties: [{name: '表单名称', type: '文本', description: '业务所需表单的名称，例如：采购申请表。'}, {name: '表单入口', type: '文本', description: '员工获取表单的位置，例如：企业门户 → 办事大厅 → 采购申请。'}]}
      ],
      relations: [
        {name: '规定流程', from: '制度', to: '业务流程', properties: [{name: '依据条款', type: '文本', description: '规定该流程的具体条款，例如：第八条·申请与审批。'}, {name: '来源文档', type: '文本', description: '流程依据的制度文件，例如：采购管理办法（2026版）。'}]},
        {name: '负责办理', from: '职责部门', to: '业务流程', properties: [{name: '办理说明', type: '文本', description: '说明部门的办理职责，例如：核对并受理申请。'}, {name: '负责环节', type: '文本', description: '该部门在流程中负责的环节，例如：材料初审。'}]},
        {name: '使用表单', from: '业务流程', to: '表单', properties: [{name: '使用环节', type: '文本', description: '该流程使用此表单的环节，例如：提交采购申请。'}, {name: '是否必填', type: '是/否', description: '办理该流程是否必须提交此表单，例如：是。'}]}
      ],
      changes: ['更新制度生效日期及办理时限。', '调整流程的职责部门。', '补充表单入口和制度文件来源。'],
      entitiesCount: 84, relationsCount: 156, documentCount: 16
    }
  ];

  const records = [];
  Object.keys(typeNames).forEach((type, typeIndex) => {
    Object.keys(statusNames).forEach((status, statusIndex) => {
      const domain = domains[(typeIndex + statusIndex) % domains.length];
      const day = 13 - typeIndex * 2 - statusIndex;
      const submittedAt = '2026-10-' + String(day).padStart(2, '0') + ' ' + (10 + typeIndex) + ':'
        + String(45 - statusIndex * 8).padStart(2, '0') + ':00';
      const changed = type.endsWith('change');
      const graph = type.startsWith('graph');
      records.push({
        id: 'gr-' + type + '-' + status, type, status, domain,
        name: domain.name, applicant: ['培训管理员', '知识运营员', '资料管理员', '内容管理员'][statusIndex],
        submittedAt, reviewedAt: status === 'pending' ? '' : submittedAt.slice(0, 11) + '16:20:00',
        reviewer: status === 'approved' || status === 'rejected' ? '审核管理员' : '',
        version: changed ? 'V2.0' : 'V1.0', previousVersion: changed ? 'V1.0' : '',
        quality: graph ? (status === 'rejected' ? 92 : typeIndex === 3 ? 98 : 100) : null,
        qualityIssues: graph ? (status === 'rejected' ? 5 : typeIndex === 3 ? 2 : 0) : null,
        note: status === 'approved' ? '内容完整，来源明确，符合发布要求。'
          : status === 'rejected' ? (graph ? '部分来源信息尚未补齐，请完善后重新提交。' : '请补充关键属性的说明与示例，明确关系的适用范围。')
          : status === 'cancelled' ? '申请人已取消申请，待内容补充完成后重新提交。' : '',
        application: graph
          ? (changed ? '提交更新后的图谱内容，包含新增实体、关系及来源文档，请审核本次变更。' : '图谱已完成知识抽取、融合及质检，申请正式发布供查询和问答使用。')
          : (changed ? '提交本体结构调整，变更涉及实体类型、关系及属性，请核对后审核。' : '实体类型、关系与属性已配置完成，申请发布本体用于后续知识抽取。')
      });
    });
  });
  records.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  let page = 1, drawerId = null, decision = null, drawerOrigin = null, decisionOrigin = null, toastTimer;
  const drawer = document.createElement('dialog');
  drawer.id = 'graphReviewDrawer';
  drawer.className = 'gr-review-drawer';
  drawer.setAttribute('aria-labelledby', 'graphReviewDrawerTitle');
  const decisionDialog = document.createElement('dialog');
  decisionDialog.id = 'graphReviewDecision';
  decisionDialog.className = 'gr-review-decision';
  decisionDialog.setAttribute('aria-labelledby', 'graphReviewDecisionTitle');
  const toast = document.createElement('div');
  toast.id = 'graphReviewToast';
  toast.className = 'gr-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  document.body.append(drawer, decisionDialog, toast);

  const statusTag = record => '<span class="gr-status ' + record.status + '">' + statusNames[record.status] + '</span>';
  const actionButton = (record, action, label, classes = 'gr-link') =>
    '<button type="button" class="' + classes + '" data-gr-id="' + record.id + '" data-gr-action="' + action + '" aria-label="' + escape(record.name + '：' + label) + '">' + label + '</button>';
  const filtered = () => {
    const type = $('graphReviewType').value, status = $('graphReviewStatus').value;
    const query = $('graphReviewSearch').value.trim().toLocaleLowerCase();
    return records.filter(record =>
      (!type || type === 'all' || type === record.type)
      && (!status || status === 'all' || status === record.status)
      && (!query || record.name.toLocaleLowerCase().includes(query))
    );
  };
  const pageSize = () => Number($('graphReviewPageSize').value) === 20 ? 20 : 10;
  const findRecord = id => records.find(record => record.id === id);

  function render() {
    const matches = filtered(), size = pageSize(), pages = Math.max(1, Math.ceil(matches.length / size));
    page = Math.max(1, Math.min(page, pages));
    const rows = matches.slice((page - 1) * size, page * size);
    $('graphReviewRows').innerHTML = rows.map(record =>
      '<tr data-gr-record="' + record.id + '"><td><button type="button" class="gr-name" data-gr-id="' + record.id + '" data-gr-action="detail">' + escape(record.name) + '</button>'
      + '<span class="gr-version">' + escape(record.version) + '</span></td>'
      + '<td>' + typeNames[record.type] + '</td><td>' + escape(record.applicant) + '</td><td>' + statusTag(record) + '</td>'
      + '<td>' + escape(record.submittedAt) + '</td><td><div class="gr-actions">'
      + actionButton(record, 'detail', '查看详情')
      + (record.status === 'pending' ? actionButton(record, 'approve', '通过') + actionButton(record, 'reject', '驳回', 'gr-link danger') : '')
      + '</div></td></tr>'
    ).join('');
    $('graphReviewEmpty').hidden = matches.length > 0;
    $('graphReviewTotal').textContent = '共 ' + matches.length + ' 条';
    $('graphReviewPage').textContent = page + ' / ' + pages;
    $('graphReviewPrev').disabled = page === 1;
    $('graphReviewNext').disabled = page === pages;
  }

  function detailRow(label, value) {
    return '<tr><th scope="row">' + label + '</th><td>' + value + '</td></tr>';
  }

  function ownerCard(owner, kind) {
    const properties = owner.properties || [];
    const relationship = kind === 'relation';
    return '<details class="gr-owner-card" data-gr-owner-kind="' + kind + '" data-gr-owner-name="' + escape(owner.name) + '" open>'
      + '<summary><strong class="gr-owner-name">' + escape(owner.name) + '</strong><span class="gr-owner-count">' + properties.length + ' 项属性</span></summary>'
      + (relationship ? '<div class="gr-relation-path" aria-label="关系方向"><span>' + escape(owner.from) + '</span><span class="gr-path-arrow" aria-hidden="true">→</span><span>' + escape(owner.to) + '</span></div>' : '')
      + (properties.length ? '<table class="gr-config-table gr-owner-properties" aria-label="' + escape(owner.name + (relationship ? '关系' : '实体') + '的属性') + '">'
        + '<colgroup><col style="width:24%"><col style="width:16%"><col style="width:60%"></colgroup>'
        + '<thead><tr><th scope="col">属性名称</th><th scope="col">数据类型</th><th scope="col">说明与示例</th></tr></thead><tbody>'
        + properties.map(property => '<tr><td>' + escape(property.name) + '</td><td>' + escape(property.type) + '</td><td class="gr-owner-description">' + escape(property.description || '未填写') + '</td></tr>').join('')
        + '</tbody></table>' : '<p class="gr-owner-empty">暂未配置属性</p>')
      + '</details>';
  }

  function ontologyConfiguration(domain) {
    return '<section class="gr-section gr-ontology-config"><h3>本体配置</h3>'
      + '<p class="gr-muted">属性随所属实体或关系展示，可收起或展开逐项核对。</p>'
      + '<h4>实体类型 <span class="gr-owner-group-count">' + domain.entities.length + '</span></h4>'
      + '<div class="gr-owner-list">' + domain.entities.map(entity => ownerCard(entity, 'entity')).join('') + '</div>'
      + '<h4>关系定义 <span class="gr-owner-group-count">' + domain.relations.length + '</span></h4>'
      + '<div class="gr-owner-list">' + domain.relations.map(relation => ownerCard(relation, 'relation')).join('') + '</div></section>';
  }

  function renderDrawer() {
    const record = findRecord(drawerId);
    if (!record) return;
    const domain = record.domain, isGraph = record.type.startsWith('graph'), changed = record.type.endsWith('change');
    drawer.innerHTML = '<header class="gr-drawer-head"><h2 id="graphReviewDrawerTitle">图谱审核详情</h2>'
      + '<button type="button" class="gr-close" data-gr-close="drawer" aria-label="关闭图谱审核详情">×</button></header>'
      + '<div class="gr-drawer-body"><div class="gr-summary"><strong>' + escape(record.name) + '</strong>' + statusTag(record) + '</div>'
      + '<section class="gr-section"><h3>基础信息</h3><table class="gr-info-table"><tbody>'
      + detailRow('图谱本体名称', escape(record.name))
      + detailRow('描述', escape(domain.description))
      + detailRow('申请人', escape(record.applicant))
      + detailRow('审核类型', typeNames[record.type])
      + detailRow('申请状态', statusTag(record))
      + detailRow('申请时间', escape(record.submittedAt))
      + detailRow('申请版本', escape(record.version))
      + (changed ? detailRow('当前版本', escape(record.previousVersion)) : '')
      + (record.reviewedAt ? detailRow(record.status === 'cancelled' ? '取消时间' : '审核时间', escape(record.reviewedAt)) : '')
      + (record.reviewer ? detailRow('审核人', escape(record.reviewer)) : '')
      + '</tbody></table></section>'
      + '<section class="gr-section"><h3>申请内容</h3><p class="gr-note">' + escape(record.application) + '</p></section>'
      + (changed ? '<section class="gr-section"><h3>变更摘要</h3><p class="gr-muted">' + escape(record.previousVersion) + ' → ' + escape(record.version) + '</p><ul class="gr-change-list">'
        + domain.changes.map(text => '<li>' + escape(text) + '</li>').join('') + '</ul></section>' : '')
      + (isGraph ? '<section class="gr-section"><h3>图谱质量概览</h3><div class="gr-quality-grid">'
        + [['综合评分', record.quality + ' 分'], ['待核对项', record.qualityIssues + ' 项'], ['实体数量', domain.entitiesCount], ['关系数量', domain.relationsCount], ['来源文档', domain.documentCount + ' 篇']]
          .map(([label, value]) => '<div class="gr-quality-item"><span>' + label + '</span><strong>' + escape(value) + '</strong></div>').join('')
        + '</div><p class="gr-muted">展示本次申请提交时的质检结果，仅供审核核对。</p></section>' : '')
      + ontologyConfiguration(domain)
      + (record.status !== 'pending' ? '<section class="gr-section"><h3>' + (record.status === 'cancelled' ? '取消说明' : '审核备注') + '</h3><p class="gr-note">' + escape(record.note || '暂无备注') + '</p></section>' : '')
      + '</div><footer class="gr-drawer-foot"><button type="button" class="gr-button" data-gr-close="drawer">关闭</button>'
      + (record.status === 'pending' ? actionButton(record, 'reject', '驳回', 'gr-button danger') + actionButton(record, 'approve', '通过', 'gr-button primary') : '')
      + '</footer>';
  }

  function focusOrigin(origin, fallback) {
    if (origin?.node?.isConnected && !origin.node.disabled) {
      origin.node.focus({preventScroll: true});
      return;
    }
    const container = origin?.inDrawer && drawer.open ? drawer : $('graphReviewRows');
    const available = origin?.id && [...container.querySelectorAll('[data-gr-id]')].find(button =>
      button.dataset.grId === origin.id && button.dataset.grAction === origin.action);
    const detail = origin?.id && [...container.querySelectorAll('[data-gr-id]')].find(button =>
      button.dataset.grId === origin.id && button.dataset.grAction === 'detail');
    (available || detail || fallback)?.focus({preventScroll: true});
  }

  function originFor(node, id, action) {
    return {node, id, action, inDrawer: drawer.contains(node)};
  }

  function openDrawer(id, source) {
    if (!findRecord(id)) return;
    drawerId = id;
    drawerOrigin = originFor(source, id, 'detail');
    renderDrawer();
    drawer.showModal();
    drawer.querySelector('[data-gr-close]').focus();
  }

  function openDecision(id, action, source) {
    const record = findRecord(id);
    if (!record || record.status !== 'pending') return;
    decision = {id, action};
    decisionOrigin = originFor(source, id, action);
    const reject = action === 'reject';
    decisionDialog.innerHTML = '<header class="gr-decision-head"><h2 id="graphReviewDecisionTitle">' + (reject ? '驳回申请' : '确认通过审核') + '</h2>'
      + '<button type="button" class="gr-close" data-gr-close="decision" aria-label="关闭审核确认">×</button></header>'
      + '<form id="graphReviewDecisionForm"><div class="gr-decision-body"><p class="gr-note">正在审核「' + escape(record.name) + '」的' + typeNames[record.type] + '申请。</p>'
      + (reject ? '<label class="gr-form-field" for="graphReviewReason">驳回原因 <span class="gr-required">*</span></label>'
        : '<p class="gr-muted">请确认申请内容已核对无误。通过后，本条申请将标记为“已通过”。</p><label class="gr-form-field" for="graphReviewReason">审核备注（选填）</label>')
      + '<textarea id="graphReviewReason" maxlength="500" rows="4" placeholder="' + (reject ? '请说明需要修改的内容，便于申请人完善后重新提交' : '可填写审核意见') + '" aria-describedby="graphReviewReasonHint graphReviewDecisionError"></textarea>'
      + '<div class="gr-field-hint" id="graphReviewReasonHint">最多 500 字</div><p class="gr-error" id="graphReviewDecisionError" role="alert" hidden></p>'
      + '</div><footer class="gr-decision-foot"><button type="button" class="gr-button" data-gr-close="decision">取消</button>'
      + '<button type="submit" class="gr-button ' + (reject ? 'danger' : 'primary') + '" id="graphReviewDecisionConfirm">' + (reject ? '确认驳回' : '确认通过') + '</button></footer></form>';
    decisionDialog.showModal();
    (reject ? $('graphReviewReason') : $('graphReviewDecisionConfirm')).focus();
  }

  function currentTime() {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function notify(text) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  $('graphReviewRows').addEventListener('click', event => {
    const button = event.target.closest('[data-gr-action]');
    if (!button) return;
    if (button.dataset.grAction === 'detail') openDrawer(button.dataset.grId, button);
    else openDecision(button.dataset.grId, button.dataset.grAction, button);
  });
  drawer.addEventListener('click', event => {
    if (event.target.closest('[data-gr-close="drawer"]')) drawer.close();
    const button = event.target.closest('[data-gr-action]');
    if (button) openDecision(button.dataset.grId, button.dataset.grAction, button);
  });
  decisionDialog.addEventListener('click', event => {
    if (event.target.closest('[data-gr-close="decision"]')) decisionDialog.close();
  });
  decisionDialog.addEventListener('submit', event => {
    event.preventDefault();
    if (!decision) return;
    const record = findRecord(decision.id), reason = $('graphReviewReason').value.trim();
    if (!record || record.status !== 'pending') {
      $('graphReviewDecisionError').textContent = '该申请已处理，请关闭后查看最新状态。';
      $('graphReviewDecisionError').hidden = false;
      return;
    }
    if (decision.action === 'reject' && !reason) {
      $('graphReviewDecisionError').textContent = '请填写驳回原因。';
      $('graphReviewDecisionError').hidden = false;
      $('graphReviewReason').setAttribute('aria-invalid', 'true');
      $('graphReviewReason').focus();
      return;
    }
    if (reason.length > 500) {
      $('graphReviewDecisionError').textContent = '审核意见最多 500 字。';
      $('graphReviewDecisionError').hidden = false;
      return;
    }
    record.status = decision.action === 'reject' ? 'rejected' : 'approved';
    record.note = reason || '内容已核对，审核通过。';
    record.reviewedAt = currentTime();
    record.reviewer = '审核管理员';
    render();
    if (drawer.open && drawerId === record.id) renderDrawer();
    decisionDialog.close();
    notify(record.status === 'approved' ? '审核已通过' : '已记录驳回意见');
  });
  decisionDialog.addEventListener('input', event => {
    if (event.target.id === 'graphReviewReason') {
      $('graphReviewDecisionError').hidden = true;
      event.target.removeAttribute('aria-invalid');
    }
  });
  drawer.addEventListener('close', () => focusOrigin(drawerOrigin, $('graphReviewSearch')));
  decisionDialog.addEventListener('close', () => {
    focusOrigin(decisionOrigin, drawer.open ? drawer.querySelector('[data-gr-close]') : $('graphReviewSearch'));
    decision = null;
  });

  for (const dialog of [drawer, decisionDialog]) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  for (const id of ['graphReviewType', 'graphReviewStatus', 'graphReviewPageSize']) {
    $(id).addEventListener('change', () => { page = 1; render(); });
  }
  $('graphReviewSearch').addEventListener('input', () => { page = 1; render(); });
  $('graphReviewReset').addEventListener('click', () => {
    $('graphReviewType').value = 'all';
    $('graphReviewStatus').value = 'all';
    $('graphReviewSearch').value = '';
    page = 1;
    render();
  });
  $('graphReviewPrev').addEventListener('click', () => { page -= 1; render(); });
  $('graphReviewNext').addEventListener('click', () => { page += 1; render(); });
  render();
})();
