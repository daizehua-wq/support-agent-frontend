import { useEffect, useState } from 'react';
import { Button, Card, Space, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY_PREFIX = 'ap-legacy-route-redirected-';

type RouteCategory = 'analyze' | 'script' | 'manage' | 'output' | 'history' | 'default';

type NoticeConfig = {
  title: string;
  description: string;
  buttonLabel: string;
  targetPath: string;
};

const NOTICE_MAP: Record<RouteCategory, NoticeConfig> = {
  analyze: {
    title: '页面已升级',
    description:
      'Analyze / Search 已合并到新版工作台。你现在只需要输入任务目标，系统会自动规划分析、资料检索和输出生成。',
    buttonLabel: '进入新版工作台',
    targetPath: '/workbench',
  },
  script: {
    title: 'Script 已升级为 Output 输出工作台',
    description:
      '请先进入工作台创建或继续任务，生成 Output 后可查看完整交付。',
    buttonLabel: '进入工作台',
    targetPath: '/workbench',
  },
  manage: {
    title: '该管理页面已迁移至设置管理中心',
    description:
      '模型、助手、数据源、应用、运行状态和治理记录现在统一在设置管理中心管理。',
    buttonLabel: '进入设置管理中心',
    targetPath: '/settings/overview',
  },
  output: {
    title: 'Output 路由已升级',
    description: 'Output 现在从任务详情中进入。请先进入工作台创建或继续任务，或从历史任务中查看已有 Output。',
    buttonLabel: '进入工作台',
    targetPath: '/workbench',
  },
  history: {
    title: '历史记录已升级为历史任务',
    description:
      '这里记录的是任务档案，不是聊天记录。你可以回看任务计划、证据资料、Output 版本、风险限制和执行上下文。',
    buttonLabel: '进入历史任务',
    targetPath: '/tasks',
  },
  default: {
    title: '页面已迁移',
    description: '该页面已迁移到新位置，请使用新版导航访问。',
    buttonLabel: '前往新版首页',
    targetPath: '/',
  },
};

const ANALYZE_LIKE_PATHS = ['/analyze', '/judge', '/search', '/retrieve'];
const SCRIPT_LIKE_PATHS = ['/script', '/compose'];
const MANAGE_LIKE_PATHS = [
  '/model-center',
  '/assistant-center',
  '/agent',
  '/database-manager',
  '/apps',
  '/manage',
  '/settings',
  '/history',
];
const OUTPUT_LIKE_PATHS = ['/output'];

function resolveCategory(pathname: string): RouteCategory {
  if (ANALYZE_LIKE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return 'analyze';
  }

  if (SCRIPT_LIKE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return 'script';
  }

  if (MANAGE_LIKE_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return 'manage';
  }

  if (OUTPUT_LIKE_PATHS.some((p) => pathname.startsWith(p))) {
    return 'output';
  }

  if (pathname.startsWith('/sessions/') || pathname.startsWith('/history')) {
    return 'history';
  }

  return 'default';
}

function LegacyRouteUpgradeNotice() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const currentPath = window.location.pathname;
  const category = resolveCategory(currentPath);
  const storageKey = `${STORAGE_KEY_PREFIX}${category}`;
  const baseConfig = NOTICE_MAP[category];

  const taskIdMatch = currentPath.match(/\/(?:output|sessions|history)\/([^/]+)/);
  const extractedTaskId = taskIdMatch ? taskIdMatch[1] : '';

  let resolvedTargetPath = baseConfig.targetPath;
  if (category === 'output' && extractedTaskId) {
    resolvedTargetPath = `/tasks/${extractedTaskId}/output`;
  } else if (category === 'history' && extractedTaskId) {
    resolvedTargetPath = `/tasks/${extractedTaskId}`;
  }

  const config: NoticeConfig = { ...baseConfig, targetPath: resolvedTargetPath };

  const hasSeenBefore = localStorage.getItem(storageKey) === 'true';

  useEffect(() => {
    if (hasSeenBefore) {
      navigate(config.targetPath, { replace: true });
    }
  }, [hasSeenBefore, config.targetPath, navigate]);

  if (hasSeenBefore || dismissed) {
    navigate(config.targetPath, { replace: true });
    return null;
  }

  const handleGo = () => {
    localStorage.setItem(storageKey, 'true');
    navigate(config.targetPath, { replace: true });
  };

  const handleLater = () => {
    message.info('下次访问时会再次提醒你');
    setDismissed(true);
    navigate(config.targetPath, { replace: true });
  };

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card
        style={{ maxWidth: 520, width: '100%', borderRadius: 28 }}
        styles={{ body: { padding: 32 } }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {config.title}
            </Typography.Title>
            <Typography.Paragraph
              type="secondary"
              style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.8 }}
            >
              {config.description}
            </Typography.Paragraph>
          </div>

          <Space>
            <Button type="primary" size="large" onClick={handleGo}>
              {config.buttonLabel}
            </Button>
            <Button size="large" onClick={handleLater}>
              稍后再说
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}

export default LegacyRouteUpgradeNotice;
