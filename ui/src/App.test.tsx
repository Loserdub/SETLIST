import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { useAppStore } from './store/useAppStore';

describe('useAppStore', () => {
  it('updates state with ping response', async () => {
    const mockBackend = {
      ping: async () => 'pong',
    };

    await useAppStore.getState().fetchPing(mockBackend);
    expect(useAppStore.getState().pingResult).toBe('pong');
    expect(useAppStore.getState().isLoading).toBe(false);
    expect(useAppStore.getState().error).toBeNull();
  });
});

describe('App component', () => {
  it('displays pong result when ping succeeds', () => {
    useAppStore.setState({
      pingResult: 'pong',
      isLoading: false,
      error: null,
      fetchPing: vi.fn(),
    });

    render(<App />);
    expect(screen.getByTestId('ping-result').textContent).toBe('pong');
  });
});
