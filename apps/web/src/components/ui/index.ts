// Design System barrel export — import all UI primitives from this file.
// Usage: import { Button, Badge, Table, Modal, Card, Toast, Spinner } from "@/components/ui";

export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { Select } from "./Select";
export type { SelectProps, SelectOption } from "./Select";

export { Badge, statusVariant } from "./Badge";
export type { BadgeProps, BadgeVariant } from "./Badge";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";

export { Table } from "./Table";
export type { TableProps, Column } from "./Table";

export { Spinner, PageSpinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { Select } from "./Select";
export type { SelectProps, SelectOption } from "./Select";

// Toast: component, container, provider, hook
export { Toast, ToastContainer, ToastProvider, useToast } from "./Toast";
export type { ToastProps, ToastItem, ToastVariant } from "./Toast";
