import { Typography } from 'antd';
import type { ReactNode } from 'react';

type SettingsModuleShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  statusBadge?: ReactNode;
  embeddedLegacy?: boolean;
};

function SettingsModuleShell({ title, description, children, statusBadge, embeddedLegacy = false }: SettingsModuleShellProps) {
  return (
    <div className="ap-settings-module-shell">
      <div className="ap-settings-module-header">
        <div>
          <Typography.Title level={2} style={{ margin: 0, fontSize: 24 }}>
            {title}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 14 }}>
            {description}
          </Typography.Paragraph>
        </div>
        {statusBadge}
      </div>
      <div className={embeddedLegacy ? 'ap-settings-embedded-panel ap-settings-embedded-panel--legacy' : 'ap-settings-embedded-panel'}>
        {children}
      </div>
    </div>
  );
}

export default SettingsModuleShell;
