import type { IconType } from "react-icons";
import {
  MdAddCircleOutline,
  MdOutlineAssignment,
  MdOutlineDescription,
  MdOutlineQuestionAnswer,
  MdOutlineSwapHoriz,
  MdOutlineUploadFile,
} from "react-icons/md";

// Single source of truth for the app's menu: rendered by NavBar (side nav) and
// searched by NavSearch (header). Add new pages here.
export type NavLeaf = {
  eventKey: string;
  href: string;
  label: string;
  icon: IconType;
  match: (pathname: string) => boolean;
};

export type NavGroup = {
  eventKey: string;
  label: string;
  icon: IconType;
  items: NavLeaf[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    eventKey: "question-bank",
    label: "Question Bank",
    icon: MdOutlineQuestionAnswer,
    items: [
      {
        eventKey: "question-bank-create",
        href: "/questions/new",
        label: "Create Questions",
        icon: MdAddCircleOutline,
        match: (p) => p === "/questions/new",
      },
      {
        eventKey: "question-bank-browse",
        href: "/questions",
        label: "Browse Question Bank",
        icon: MdOutlineQuestionAnswer,
        match: (p) => p === "/questions",
      },
    ],
  },
  {
    eventKey: "exam-designer",
    label: "Exam Designer",
    icon: MdOutlineAssignment,
    items: [
      {
        eventKey: "exam-designer-list",
        href: "/exam-designer",
        label: "Exam List",
        icon: MdOutlineAssignment,
        match: (p) => p === "/exam-designer",
      },
    ],
  },
  {
    eventKey: "exam-template",
    label: "Exam Template",
    icon: MdOutlineDescription,
    items: [
      {
        eventKey: "exam-template-list",
        href: "/exam-templates",
        label: "Exam Template List",
        icon: MdOutlineDescription,
        match: (p) => p === "/exam-templates",
      },
    ],
  },
  {
    eventKey: "migration",
    label: "Migration",
    icon: MdOutlineSwapHoriz,
    items: [
      {
        eventKey: "migration-from-json",
        href: "/migration/json",
        label: "Question Migration",
        icon: MdOutlineUploadFile,
        match: (p) => p === "/migration/json",
      },
    ],
  },
];
