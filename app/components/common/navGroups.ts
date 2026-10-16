import type { IconType } from "react-icons";
import {
  MdAddCircleOutline,
  MdOutlineAssignment,
  MdOutlineDescription,
  MdOutlineFactCheck,
  MdOutlineInventory2,
  MdOutlineMenuBook,
  MdOutlineFunctions,
  MdOutlineQuestionAnswer,
  MdOutlineBuild,
  MdOutlineSell,
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
      {
        eventKey: "question-bank-tags",
        href: "/tags",
        label: "Question Tags",
        icon: MdOutlineSell,
        match: (p) => p === "/tags" || p.startsWith("/tags/"),
      },
      {
        eventKey: "question-bank-case-studies",
        href: "/case-studies",
        label: "Case Studies",
        icon: MdOutlineMenuBook,
        match: (p) => p === "/case-studies",
      },
      {
        eventKey: "question-bank-lots",
        href: "/questions/lots",
        label: "Question Lots",
        icon: MdOutlineInventory2,
        match: (p) => p === "/questions/lots",
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
      {
        eventKey: "exam-designer-attempts",
        href: "/attempts",
        label: "Exam Attempts",
        icon: MdOutlineFactCheck,
        match: (p) => p === "/attempts",
      },
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
    eventKey: "tools",
    label: "Tools",
    icon: MdOutlineBuild,
    items: [
      {
        eventKey: "tools-word-latex",
        href: "/tools/word-latex",
        label: "Word to LaTeX Converter",
        icon: MdOutlineFunctions,
        match: (p) => p === "/tools/word-latex",
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
