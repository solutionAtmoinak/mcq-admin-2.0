"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar, Sidenav, Nav } from "rsuite";
import type { IconType } from "react-icons";
import {
  MdHome,
  MdOutlineQuestionAnswer,
  MdAddCircleOutline,
  MdOutlineAssignment,
  MdOutlineDescription,
} from "react-icons/md";

type NavLeaf = {
  eventKey: string;
  href: string;
  label: string;
  icon: IconType;
  match: (pathname: string) => boolean;
};

type NavGroup = {
  eventKey: string;
  label: string;
  icon: IconType;
  items: NavLeaf[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    eventKey: "question-bank",
    label: "Question Bank",
    icon: MdOutlineQuestionAnswer,
    items: [
      {
        eventKey: "question-bank-browse",
        href: "/questions",
        label: "Browse Question Bank",
        icon: MdOutlineQuestionAnswer,
        match: (p) => p === "/questions",
      },
      {
        eventKey: "question-bank-create",
        href: "/questions/new",
        label: "Create Questions",
        icon: MdAddCircleOutline,
        match: (p) => p === "/questions/new",
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
        label: "Template List",
        icon: MdOutlineDescription,
        match: (p) => p === "/exam-templates",
      }
    ],
  },
];

export default function NavBar() {
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState(true);

  return (
    <Sidebar
      width={expanded ? 240 : 56}
      collapsible
      className="sticky top-0 z-40 h-screen shrink-0 border-r border-zinc-200 bg-white"
      style={{ display: "flex", flexDirection: "column", height: "100vh", overflowY: "hidden" }}
    >
      <Sidenav expanded={expanded} appearance="subtle" className="flex flex-1 flex-col">
        <Sidenav.Header className="flex justify-end border-b border-zinc-100 gap-x-2 items-center">
          {expanded && (
            <h2 className="text-xs font-bold bg-zinc-900 p-2 rounded-lg text-zinc-50">
              DTH Advance Exam Admin
            </h2>
          )}
          <Sidenav.Toggle onToggle={setExpanded} />
        </Sidenav.Header>
        <Sidenav.Body className="flex-1">
          <Nav>
            <Nav.Item as={Link} href="/" icon={<MdHome />} active={pathname === "/"}>
              MCQ Admin
            </Nav.Item>
            {NAV_GROUPS.map((group) => (
              <Fragment key={group.eventKey}>
                {expanded ? <Sidenav.GroupLabel>{group.label}</Sidenav.GroupLabel> : <hr />}
                {group.items.map((item) => (
                  <Nav.Item
                    key={item.href}
                    as={Link}
                    href={item.href}
                    icon={<item.icon />}
                    active={item.match(pathname)}
                  >
                    {item.label}
                  </Nav.Item>
                ))}
              </Fragment>
            ))}
          </Nav>
        </Sidenav.Body>
      </Sidenav>
    </Sidebar>
  );
}
