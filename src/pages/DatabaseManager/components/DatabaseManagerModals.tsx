import { Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';

import {
  createModeOptions,
  databaseTypeOptions,
  type DatabaseItem,
  usesNetworkConnectionFields,
} from '../helpers';

type DatabaseManagerModalsProps = {
  createModalOpen: boolean;
  editModalOpen: boolean;
  bindingModalOpen: boolean;
  creating: boolean;
  saving: boolean;
  savingBindings: boolean;
  createForm: FormInstance;
  editForm: FormInstance;
  bindingForm: FormInstance;
  databases: DatabaseItem[];
  createMode: 'register-only' | 'create-remote';
  createDatabaseType: string;
  editDatabaseType: string;
  onCreateSubmit: () => void;
  onEditSubmit: () => void;
  onSaveBindings: () => void;
  onCloseCreate: () => void;
  onCloseEdit: () => void;
  onCloseBindings: () => void;
};

function DatabaseManagerModals({
  createModalOpen,
  editModalOpen,
  bindingModalOpen,
  creating,
  saving,
  savingBindings,
  createForm,
  editForm,
  bindingForm,
  databases,
  createMode,
  createDatabaseType,
  editDatabaseType,
  onCreateSubmit,
  onEditSubmit,
  onSaveBindings,
  onCloseCreate,
  onCloseEdit,
  onCloseBindings,
}: DatabaseManagerModalsProps) {
  return (
    <>
      <Modal
        title="新增数据库"
        open={createModalOpen}
        onOk={onCreateSubmit}
        onCancel={onCloseCreate}
        confirmLoading={creating}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="接入方式"
            name="createMode"
            initialValue="register-only"
            extra="仅登记配置适合接入已有数据库或先录入待联调连接；创建远端数据库会立即尝试真建库。"
            rules={[{ required: true, message: '请选择接入方式' }]}
          >
            <Select options={createModeOptions} placeholder="请选择接入方式" />
          </Form.Item>
          <Form.Item
            label="数据库类型"
            name="databaseType"
            initialValue="mysql"
            rules={[{ required: true, message: '请选择数据库类型' }]}
          >
            <Select options={databaseTypeOptions} placeholder="请选择数据库类型" />
          </Form.Item>
          <Form.Item
            label="数据库名称"
            name="databaseName"
            rules={[{ required: true, message: '请输入数据库名称' }]}
          >
            <Input placeholder="请输入数据库名称" />
          </Form.Item>
          {usesNetworkConnectionFields(createDatabaseType) ? (
            <>
              <Form.Item
                label="Host"
                name="host"
                rules={[{ required: true, message: '请输入 Host' }]}
              >
                <Input placeholder="请输入 Host" />
              </Form.Item>
              <Form.Item
                label="Port"
                name="port"
                rules={[{ required: true, message: '请输入 Port' }]}
              >
                <InputNumber style={{ width: '100%' }} placeholder="请输入 Port" />
              </Form.Item>
              <Form.Item
                label="用户名"
                name="username"
                rules={[{ required: true, message: '请输入数据库用户名' }]}
              >
                <Input placeholder="请输入数据库用户名" />
              </Form.Item>
              <Form.Item label="密码" name="password">
                <Input.Password placeholder="请输入数据库密码" />
              </Form.Item>
              {createMode === 'create-remote' ? (
                <>
                  <Form.Item
                    label="管理员用户名"
                    name="adminUsername"
                    extra="可选。若建库/删库需要更高权限，建议单独填写管理员账号。"
                  >
                    <Input placeholder="留空则默认复用数据库用户名" />
                  </Form.Item>
                  <Form.Item label="管理员密码" name="adminPassword">
                    <Input.Password placeholder="留空则默认复用数据库密码" />
                  </Form.Item>
                </>
              ) : null}
            </>
          ) : (
            <Form.Item label="数据库文件" name="databaseFile">
              <Input placeholder="可选，默认写入 mock-server/data/*.db" />
            </Form.Item>
          )}
          <Form.Item label="环境" name="environment">
            <Input placeholder="如 生产 / 测试 / 归档" />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="请输入说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑连接并保存"
        open={editModalOpen}
        onOk={onEditSubmit}
        onCancel={onCloseEdit}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            label="数据库类型"
            name="databaseType"
            rules={[{ required: true, message: '请选择数据库类型' }]}
          >
            <Select options={databaseTypeOptions} placeholder="请选择数据库类型" />
          </Form.Item>
          <Form.Item
            label="数据库名称"
            name="databaseName"
            rules={[{ required: true, message: '请输入数据库名称' }]}
          >
            <Input placeholder="请输入数据库名称" />
          </Form.Item>
          {usesNetworkConnectionFields(editDatabaseType) ? (
            <>
              <Form.Item
                label="Host"
                name="host"
                rules={[{ required: true, message: '请输入 Host' }]}
              >
                <Input placeholder="请输入 Host" />
              </Form.Item>
              <Form.Item
                label="Port"
                name="port"
                rules={[{ required: true, message: '请输入 Port' }]}
              >
                <InputNumber style={{ width: '100%' }} placeholder="请输入 Port" />
              </Form.Item>
              <Form.Item
                label="用户名"
                name="username"
                rules={[{ required: true, message: '请输入数据库用户名' }]}
              >
                <Input placeholder="请输入数据库用户名" />
              </Form.Item>
              <Form.Item label="密码" name="password" extra="留空则保持当前数据库密码不变。">
                <Input.Password placeholder="如需更新，请输入新密码" />
              </Form.Item>
              <Form.Item
                label="管理员用户名"
                name="adminUsername"
                extra="可选。若建库/删库需要更高权限，可单独维护管理员账号。"
              >
                <Input placeholder="留空则清空管理员用户名并回退复用普通账号" />
              </Form.Item>
              <Form.Item
                label="管理员密码"
                name="adminPassword"
                extra="留空则保持当前管理员密码不变。"
              >
                <Input.Password placeholder="如需更新，请输入新管理员密码" />
              </Form.Item>
            </>
          ) : (
            <Form.Item label="数据库文件" name="databaseFile">
              <Input placeholder="可选，默认写入 mock-server/data/*.db" />
            </Form.Item>
          )}
          <Form.Item label="环境" name="environment">
            <Input placeholder="如 生产 / 测试 / 归档" />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="请输入说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="调整轻绑定关系"
        open={bindingModalOpen}
        onOk={onSaveBindings}
        onCancel={onCloseBindings}
        confirmLoading={savingBindings}
        destroyOnHidden
      >
        <Form form={bindingForm} layout="vertical">
          <Form.Item label="默认关联数据库" name="defaultAssociatedDatabase">
            <Select
              allowClear
              options={databases.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item label="可见数据库" name="visibleDatabases">
            <Select
              mode="multiple"
              options={databases.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item label="关系来源" name="relationSource">
            <Input placeholder="如 帐号默认关联 / 系统默认可见 / 人工指定可见" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default DatabaseManagerModals;
