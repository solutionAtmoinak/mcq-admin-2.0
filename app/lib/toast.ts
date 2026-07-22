import { toast, Flip, type ToastOptions } from "react-toastify";

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

// Single entry point for every toast in the app, so notifications share one
// look and behavior instead of drifting per call-site.
export function notify(message: string, type: ToastType) {
  toast[type](message, TOAST_OPTIONS);
}
