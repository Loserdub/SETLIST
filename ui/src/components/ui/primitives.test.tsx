import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Button,
  IconButton,
  ToggleKey,
  Segmented,
  Fader,
  Meter,
  Readout,
  KeyTile,
  Panel,
  Input,
  Select,
  Tabs,
  Modal,
  Tooltip,
  EmptyState,
} from './index';

describe('Hardware Design System Primitives', () => {
  describe('Button', () => {
    it('renders all variants and handles click events', () => {
      const handleClick = vi.fn();
      const { rerender } = render(
        <Button variant="primary" onClick={handleClick}>
          Primary
        </Button>
      );
      const btn = screen.getByRole('button', { name: /primary/i });
      expect(btn).toBeDefined();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button', { name: /secondary/i })).toBeDefined();

      rerender(<Button variant="ghost">Ghost</Button>);
      expect(screen.getByRole('button', { name: /ghost/i })).toBeDefined();

      rerender(<Button variant="danger">Danger</Button>);
      expect(screen.getByRole('button', { name: /danger/i })).toBeDefined();
    });

    it('respects disabled state', () => {
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>
      );
      const btn = screen.getByRole('button', { name: /disabled/i });
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('IconButton', () => {
    it('renders accessible icon button with title and aria-label', () => {
      render(
        <IconButton label="Play Track" tooltip="Play preview">
          <span>▶</span>
        </IconButton>
      );
      const btn = screen.getByRole('button', { name: 'Play Track' });
      expect(btn.getAttribute('title')).toBe('Play preview');
      expect(btn.getAttribute('aria-label')).toBe('Play Track');
    });
  });

  describe('ToggleKey', () => {
    it('renders square key with LED and switches state', () => {
      const handleToggle = vi.fn();
      const { rerender } = render(
        <ToggleKey active={false} onToggle={handleToggle} label="Mute" />
      );

      const toggle = screen.getByRole('switch', { name: /mute/i });
      expect(toggle.getAttribute('aria-checked')).toBe('false');

      fireEvent.click(toggle);
      expect(handleToggle).toHaveBeenCalledWith(true);

      rerender(<ToggleKey active={true} onToggle={handleToggle} label="Mute" />);
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('toggle-key-led')).toBeDefined();
    });
  });

  describe('Segmented', () => {
    it('renders selector strip and switches active value', () => {
      const handleChange = vi.fn();
      render(
        <Segmented
          options={[
            { value: '1x', label: '1x' },
            { value: '1.5x', label: '1.5x' },
            { value: '2x', label: '2x' },
          ]}
          value="1x"
          onChange={handleChange}
        />
      );

      const option15 = screen.getByRole('button', { name: '1.5x' });
      fireEvent.click(option15);
      expect(handleChange).toHaveBeenCalledWith('1.5x');
    });
  });

  describe('Fader', () => {
    it('renders slider and triggers change with numeric values', () => {
      const handleChange = vi.fn();
      render(
        <Fader
          value={0.5}
          min={0}
          max={1}
          step={0.01}
          onChange={handleChange}
          ariaLabel="Master Fader"
        />
      );

      const slider = screen.getByRole('slider', { name: 'Master Fader' });
      fireEvent.change(slider, { target: { value: '0.8' } });
      expect(handleChange).toHaveBeenCalledWith(0.8);
    });
  });

  describe('Meter', () => {
    it('renders N segmented LED blocks with energy level', () => {
      render(<Meter value={6} max={10} segments={10} ariaLabel="Energy rating" />);
      const progressbar = screen.getByRole('progressbar', { name: 'Energy rating' });
      expect(progressbar.getAttribute('aria-valuenow')).toBe('6');
      expect(screen.getByTestId('meter-segment-0')).toBeDefined();
      expect(screen.getByTestId('meter-segment-9')).toBeDefined();
    });
  });

  describe('Readout', () => {
    it('renders silkscreen caption and large mono readout figures', () => {
      render(<Readout caption="TEMPO" value="126.0" unit="BPM" dataTestId="tempo-readout" />);
      expect(screen.getByText('TEMPO')).toBeDefined();
      expect(screen.getByText('126.0')).toBeDefined();
      expect(screen.getByText('BPM')).toBeDefined();
    });
  });

  describe('KeyTile', () => {
    it('renders Camelot code in flat saturated tile', () => {
      render(<KeyTile camelotKey="8A" dataTestId="key-tile-8a" />);
      const tile = screen.getByTestId('key-tile-8a');
      expect(tile.textContent).toBe('8A');
      expect(tile.getAttribute('title')).toContain('8A');
    });
  });

  describe('Panel', () => {
    it('renders module with caption slot and children', () => {
      render(
        <Panel caption="LIBRARY MODULE" action={<button type="button">Scan</button>}>
          <div>Track List Content</div>
        </Panel>
      );
      expect(screen.getByText('LIBRARY MODULE')).toBeDefined();
      expect(screen.getByRole('button', { name: /scan/i })).toBeDefined();
      expect(screen.getByText('Track List Content')).toBeDefined();
    });
  });

  describe('Input', () => {
    it('renders hardware text input with caption', () => {
      const handleChange = vi.fn();
      render(
        <Input
          caption="SEARCH TRACKS"
          placeholder="Type to filter..."
          onChange={handleChange}
        />
      );
      expect(screen.getByText('SEARCH TRACKS')).toBeDefined();
      const input = screen.getByPlaceholderText('Type to filter...');
      fireEvent.change(input, { target: { value: 'Daft Punk' } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('Select', () => {
    it('renders hardware select element and triggers change', () => {
      const handleChange = vi.fn();
      render(
        <Select
          caption="HARMONIC KEY"
          options={[
            { value: 'all', label: 'All Keys' },
            { value: '8A', label: '8A' },
          ]}
          onChange={handleChange}
        />
      );
      expect(screen.getByText('HARMONIC KEY')).toBeDefined();
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '8A' } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('Tabs', () => {
    it('renders tab strip and triggers tab change', () => {
      const handleChange = vi.fn();
      render(
        <Tabs
          tabs={[
            { id: 'tracks', label: 'Tracks', count: 42 },
            { id: 'crates', label: 'Crates', count: 3 },
          ]}
          activeTab="tracks"
          onChange={handleChange}
        />
      );
      expect(screen.getByRole('tab', { name: /tracks/i })).toBeDefined();
      const cratesTab = screen.getByRole('tab', { name: /crates/i });
      fireEvent.click(cratesTab);
      expect(handleChange).toHaveBeenCalledWith('crates');
    });
  });

  describe('Modal', () => {
    it('renders dialog without shadow and handles close', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="EXPORT SETLIST">
          <div>Export Dialog Content</div>
        </Modal>
      );
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('EXPORT SETLIST')).toBeDefined();
      expect(screen.getByText('Export Dialog Content')).toBeDefined();

      const closeBtn = screen.getByRole('button', { name: 'Close modal' });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <Modal isOpen={false} onClose={() => {}}>
          <div>Hidden Content</div>
        </Modal>
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Tooltip', () => {
    it('shows tooltip content on mouse enter and hides on mouse leave', () => {
      render(
        <Tooltip content="Audition hotkey: Space">
          <button type="button">Hover Me</button>
        </Tooltip>
      );
      const target = screen.getByRole('button', { name: 'Hover Me' });
      expect(screen.queryByRole('tooltip')).toBeNull();

      fireEvent.mouseEnter(target.parentElement!);
      expect(screen.getByRole('tooltip').textContent).toBe('Audition hotkey: Space');

      fireEvent.mouseLeave(target.parentElement!);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  describe('EmptyState', () => {
    it('renders caption, headline, description, and action button', () => {
      render(
        <EmptyState
          caption="EMPTY CRATE"
          title="No tracks added"
          description="Drag audio files or choose a music folder to begin."
          action={<button type="button">Add Music</button>}
        />
      );
      expect(screen.getByText('EMPTY CRATE')).toBeDefined();
      expect(screen.getByText('No tracks added')).toBeDefined();
      expect(screen.getByText('Drag audio files or choose a music folder to begin.')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Add Music' })).toBeDefined();
    });
  });
});
