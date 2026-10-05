import { TransitionLabModal } from '../transition/TransitionLabModal';
import type { TransitionLabModalProps } from '../transition/types';

export interface TransitionAdviceModalProps extends TransitionLabModalProps {}

/**
 * TransitionAdviceModal forwards directly to TransitionLabModal,
 * providing the focused Transition Lab workspace while preserving
 * backwards compatibility across existing setlist views and test suites.
 */
export function TransitionAdviceModal(props: TransitionAdviceModalProps) {
  return <TransitionLabModal {...props} />;
}

export default TransitionAdviceModal;
