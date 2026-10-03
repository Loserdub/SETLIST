import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import { useAppStore } from '../store/useAppStore';

describe('ToastContainer Component', () => {
  beforeEach(() => {
    useAppStore.setState({ toasts: [] });
  });

  it('renders nothing when there are no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders error, success, and info toasts with messages and details', () => {
    useAppStore.setState({
      toasts: [
        {
          id: 't1',
          type: 'error',
          message: 'Scan Failed',
          details: 'Permission denied accessing folder',
        },
        {
          id: 't2',
          type: 'success',
          message: 'Export Complete',
          details: 'Saved to Rekordbox XML',
        },
        {
          id: 't3',
          type: 'info',
          message: 'Backend Switched',
        },
      ],
    });

    render(<ToastContainer />);

    expect(screen.getByTestId('toast-error')).toBeDefined();
    expect(screen.getByText('Scan Failed')).toBeDefined();
    expect(screen.getByText('Permission denied accessing folder')).toBeDefined();

    expect(screen.getByTestId('toast-success')).toBeDefined();
    expect(screen.getByText('Export Complete')).toBeDefined();
    expect(screen.getByText('Saved to Rekordbox XML')).toBeDefined();

    expect(screen.getByTestId('toast-info')).toBeDefined();
    expect(screen.getByText('Backend Switched')).toBeDefined();
  });

  it('dismisses toast when clicking dismiss button', () => {
    useAppStore.setState({
      toasts: [
        {
          id: 'toast-to-dismiss',
          type: 'error',
          message: 'Dismissable Error',
        },
      ],
    });

    render(<ToastContainer />);
    expect(screen.getByText('Dismissable Error')).toBeDefined();

    const dismissBtn = screen.getByRole('button', { name: /dismiss notification/i });
    act(() => {
      fireEvent.click(dismissBtn);
    });

    expect(useAppStore.getState().toasts).toHaveLength(0);
    expect(screen.queryByText('Dismissable Error')).toBeNull();
  });

  it('addToast in useAppStore auto-dismisses after timeout', () => {
    vi.useFakeTimers();
    try {
      act(() => {
        useAppStore.getState().addToast({
          type: 'info',
          message: 'Auto dismiss test',
        });
      });

      expect(useAppStore.getState().toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(useAppStore.getState().toasts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
