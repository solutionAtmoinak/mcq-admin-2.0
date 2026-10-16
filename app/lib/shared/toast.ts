import { toast, Flip, type ToastOptions, type ToastPosition } from "react-toastify";

export type ToastType = "success" | "error" | "warning" | "info";

const TOAST_OPTIONS: ToastOptions = {
  position: "bottom-right",
  autoClose: 5000,
  hideProgressBar: true,
  closeOnClick: false,
  pauseOnHover: true,
  draggable: true,
  theme: "dark",
  transition: Flip,
};

let currentPosition: ToastPosition = TOAST_OPTIONS.position as ToastPosition;

// A page can move every toast it raises (including those from shared child
// components) to another corner; call the returned function on unmount to restore.
export function setNotifyPosition(position: ToastPosition) {
  currentPosition = position;
  return () => {
    currentPosition = TOAST_OPTIONS.position as ToastPosition;
  };
}

// Single entry point for every toast in the app, so notifications share one
// look and behavior instead of drifting per call-site.
export function notify(message: string, type: ToastType) {
  toast[type](message, { ...TOAST_OPTIONS, position: currentPosition });
}
