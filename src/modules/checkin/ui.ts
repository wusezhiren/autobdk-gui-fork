import type { ApprovalItem } from '../../types';
import { AttendanceClockType } from '../../types';
import { escapeHtml } from '../../utils/dom';
import { iconSvg } from '../../utils/icons';

/**
 * 补签对话框 UI 管理器
 * 负责对话框的显示、更新和交互
 */
export class CheckinDialog {
  constructor(
    private dialog: HTMLDivElement,
    private title: HTMLHeadingElement,
    private content: HTMLDivElement
  ) {}

  /**
   * 显示对话框
   */
  show(): void {
    this.dialog.classList.remove('hidden');
  }

  /**
   * 隐藏对话框
   */
  hide(): void {
    this.dialog.classList.add('hidden');
  }

  /**
   * 设置标题
   */
  setTitle(title: string): void {
    this.title.textContent = title;
  }

  /**
   * 显示加载状态
   */
  showLoading(message = '正在分析考勤数据...'): void {
    this.content.innerHTML = `
      <div class="checkin-loading">
        <div class="checkin-loading-spinner"></div>
        <div class="checkin-loading-text">${escapeHtml(message)}</div>
      </div>
    `;
  }

  /**
   * 显示错误信息
   */
  showError(message: string, detail?: string): void {
    this.content.innerHTML = `
      <div class="checkin-error">
        <div class="checkin-error-icon">${iconSvg('alert-circle')}</div>
        <div>${escapeHtml(message)}</div>
        ${detail ? `<div class="checkin-error-message">${escapeHtml(detail)}</div>` : ''}
      </div>
      <div class="checkin-actions">
        <button class="checkin-btn checkin-btn-cancel" id="checkin-error-close">关闭</button>
      </div>
    `;

    // 添加关闭按钮事件
    const closeBtn = document.getElementById('checkin-error-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }

  /**
   * 显示补签预览
   */
  showPreview(
    items: ApprovalItem[],
    onConfirm: () => void,
    onCancel: () => void
  ): void {
    if (items.length === 0) {
      this.content.innerHTML = `
        <div class="checkin-preview-empty">
          <div class="checkin-preview-empty-icon">${iconSvg('check-circle')}</div>
          <div>本月考勤正常，无需补签</div>
        </div>
        <div class="checkin-actions">
          <button class="checkin-btn checkin-btn-success" id="checkin-empty-close">关闭</button>
        </div>
      `;

      const closeBtn = document.getElementById('checkin-empty-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
      }
      return;
    }

    // 按日期分组，请假等整天无需补签的日期可以一键跳过
    const groups: { date: string; indexes: number[] }[] = [];
    items.forEach((item, index) => {
      const last = groups[groups.length - 1];
      if (last && last.date === item.date) {
        last.indexes.push(index);
      } else {
        groups.push({ date: item.date, indexes: [index] });
      }
    });

    const groupsHtml = groups
      .map(
        (group, groupIndex) => `
      <div class="checkin-day">
        <label class="checkin-day-header">
          <input type="checkbox" class="checkin-check" data-day="${groupIndex}" />
          <span class="checkin-day-date">${escapeHtml(group.date)}</span>
        </label>
        ${group.indexes
          .map((index) => {
            const item = items[index];
            return `
          <label class="checkin-item status-pending" data-index="${index}">
            <div class="checkin-item-icon">
              <input type="checkbox" class="checkin-check" data-index="${index}" />
            </div>
            <div class="checkin-item-type">${AttendanceClockType[item.clockType]}:</div>
            <div class="checkin-item-time">${escapeHtml(item.date)} ${escapeHtml(item.time)}</div>
            <div class="checkin-item-status"></div>
          </label>
        `;
          })
          .join('')}
      </div>
    `
      )
      .join('');

    this.content.innerHTML = `
      <div class="checkin-preview">
        <div class="checkin-summary"></div>
        <div class="checkin-toolbar">
          <label class="checkin-toolbar-all">
            <input type="checkbox" class="checkin-check" id="checkin-select-all" />
            <span>全选</span>
          </label>
          <span class="checkin-toolbar-hint">请假等不能补卡的日期，取消勾选即可跳过</span>
        </div>
        <div class="checkin-preview-list">
          ${groupsHtml}
        </div>
      </div>
      <div class="checkin-actions">
        <button class="checkin-btn checkin-btn-cancel" id="checkin-cancel-btn">取消</button>
        <button class="checkin-btn checkin-btn-primary" id="checkin-confirm-btn">确认补签</button>
      </div>
    `;

    const summaryEl = this.content.querySelector('.checkin-summary');
    const selectAll = this.content.querySelector<HTMLInputElement>('#checkin-select-all');
    const cancelBtn = document.getElementById('checkin-cancel-btn');
    const confirmBtn = document.getElementById('checkin-confirm-btn') as HTMLButtonElement | null;

    const setCheckState = (input: HTMLInputElement | null, indexes: number[]): void => {
      if (!input) return;
      const selectedCount = indexes.filter((i) => items[i].selected).length;
      input.checked = selectedCount === indexes.length;
      input.indeterminate = selectedCount > 0 && selectedCount < indexes.length;
    };

    // 根据 items[].selected 同步所有勾选框、行样式、统计和确认按钮
    const sync = (): void => {
      items.forEach((item, index) => {
        const row = this.content.querySelector<HTMLElement>(`.checkin-item[data-index="${index}"]`);
        const input = row?.querySelector<HTMLInputElement>('input');
        const status = row?.querySelector('.checkin-item-status');
        if (input) input.checked = item.selected;
        row?.classList.toggle('is-skipped', !item.selected);
        if (status) status.textContent = item.selected ? '待补签' : '跳过';
      });

      groups.forEach((group, groupIndex) => {
        setCheckState(
          this.content.querySelector<HTMLInputElement>(`input[data-day="${groupIndex}"]`),
          group.indexes
        );
      });
      setCheckState(selectAll, items.map((_, i) => i));

      const selectedCount = items.filter((i) => i.selected).length;
      const skippedCount = items.length - selectedCount;
      if (summaryEl) {
        summaryEl.textContent = `共 ${items.length} 条记录需要补签，已选 ${selectedCount} 条${
          skippedCount > 0 ? `，跳过 ${skippedCount} 条` : ''
        }`;
      }
      if (confirmBtn) {
        confirmBtn.disabled = selectedCount === 0;
        confirmBtn.textContent = selectedCount > 0 ? `确认补签 (${selectedCount})` : '确认补签';
      }
    };

    this.content.querySelector('.checkin-preview')?.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      if (!input.classList.contains('checkin-check')) return;

      let indexes: number[];
      if (input === selectAll) {
        indexes = items.map((_, i) => i);
      } else if (input.dataset.day !== undefined) {
        indexes = groups[Number(input.dataset.day)]?.indexes ?? [];
      } else {
        indexes = [Number(input.dataset.index)];
      }

      for (const i of indexes) {
        if (items[i]) items[i].selected = input.checked;
      }
      sync();
    });

    sync();

    if (cancelBtn) {
      cancelBtn.addEventListener('click', onCancel);
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', onConfirm);
    }
  }

  /**
   * 显示进度
   */
  showProgress(items: ApprovalItem[]): void {
    const itemsHtml = items
      .map((item) => {
        const { icon, statusText, statusClass } = this.getItemStatus(item);

        return `
        <div class="checkin-item ${statusClass}">
          <div class="checkin-item-icon">${icon}</div>
          <div class="checkin-item-type">${AttendanceClockType[item.clockType]}:</div>
          <div class="checkin-item-time">${escapeHtml(item.date)} ${escapeHtml(item.time)}</div>
          <div class="checkin-item-status">${escapeHtml(statusText)}</div>
        </div>
      `;
      })
      .join('');

    const completedCount = items.filter(
      (i) => i.status === 'success' || i.status === 'error'
    ).length;

    this.content.innerHTML = `
      <div class="checkin-preview">
        <div class="checkin-summary">已完成: ${completedCount}/${items.length}</div>
        <div class="checkin-preview-list">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  /**
   * 更新单个补签项的状态
   */
  updateItem(index: number, item: ApprovalItem, allItems?: ApprovalItem[]): void {
    const itemElements = this.content.querySelectorAll('.checkin-item');
    if (!itemElements || !itemElements[index]) return;

    const itemEl = itemElements[index] as HTMLElement;

    // 移除所有状态类
    itemEl.classList.remove(
      'status-pending',
      'status-processing',
      'status-success',
      'status-error'
    );

    const { icon, statusText, statusClass } = this.getItemStatus(item);

    itemEl.classList.add(statusClass);

    const iconEl = itemEl.querySelector('.checkin-item-icon');
    const statusEl = itemEl.querySelector('.checkin-item-status');

    if (iconEl) iconEl.innerHTML = icon;
    if (statusEl) statusEl.textContent = statusText;

    // 更新进度统计
    if (allItems) {
      const completedCount = allItems.filter(
        (i) => i.status === 'success' || i.status === 'error'
      ).length;
      const summaryEl = this.content.querySelector('.checkin-summary');
      if (summaryEl) {
        summaryEl.textContent = `已完成: ${completedCount}/${allItems.length}`;
      }
    }

    // 自动滚动到当前项
    itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * 显示最终结果
   */
  showResult(
    items: ApprovalItem[],
    onClose: () => void,
    onRefresh: () => void,
    skippedCount = 0
  ): void {
    const successCount = items.filter((i) => i.status === 'success').length;
    const errorCount = items.filter((i) => i.status === 'error').length;
    const hasErrors = errorCount > 0;

    const errorItems = items.filter((i) => i.status === 'error');
    const errorsHtml =
      errorItems.length > 0
        ? `
      <div class="checkin-result-errors">
        <div class="checkin-result-errors-title">失败详情:</div>
        ${errorItems
          .map(
            (item) => `
          <div class="checkin-result-error-item">
            <div class="checkin-result-error-time">${AttendanceClockType[item.clockType]}: ${escapeHtml(item.date)} ${escapeHtml(item.time)}</div>
            <div class="checkin-result-error-message">${escapeHtml(item.error || '未知错误')}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `
        : '';

    this.content.innerHTML = `
      <div class="checkin-result">
        <div class="checkin-result-summary ${hasErrors ? 'has-errors' : ''}">
          <div class="checkin-result-title">${hasErrors ? `${iconSvg('alert-circle')} 补签完成（有失败）` : `${iconSvg('check-circle')} 补签完成`}</div>
          <div class="checkin-result-stats">
            成功: ${successCount} 条 | 失败: ${errorCount} 条${skippedCount > 0 ? ` | 跳过: ${skippedCount} 条` : ''}
          </div>
        </div>
        ${errorsHtml}
      </div>
      <div class="checkin-actions">
        <button class="checkin-btn checkin-btn-cancel" id="checkin-close-btn">关闭</button>
        <button class="checkin-btn checkin-btn-primary" id="checkin-refresh-btn">刷新日历</button>
      </div>
    `;

    // 添加事件监听器
    const closeBtn = document.getElementById('checkin-close-btn');
    const refreshBtn = document.getElementById('checkin-refresh-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', onClose);
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', onRefresh);
    }
  }

  /**
   * 获取补签项的状态显示信息
   */
  private getItemStatus(item: ApprovalItem): {
    icon: string;
    statusText: string;
    statusClass: string;
  } {
    switch (item.status) {
      case 'processing':
        return {
          icon: iconSvg('clock'),
          statusText: '处理中...',
          statusClass: 'status-processing',
        };
      case 'success':
        return {
          icon: iconSvg('check-circle'),
          statusText: '成功',
          statusClass: 'status-success',
        };
      case 'error':
        return {
          icon: iconSvg('x-circle'),
          statusText: item.error || '失败',
          statusClass: 'status-error',
        };
      default:
        return {
          icon: iconSvg('pause-circle'),
          statusText: '等待中',
          statusClass: 'status-pending',
        };
    }
  }
}
