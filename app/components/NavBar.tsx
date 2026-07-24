"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  MdAddCircleOutline,
  MdHome,
  MdOutlineAssignment,
  MdOutlineDescription,
  MdOutlineQuestionAnswer,
} from "react-icons/md";
import { Nav, Sidebar, Sidenav } from "rsuite";

const NAV_ITEMS = [
  { href: "/", label: "MCQ Admin", icon: MdHome, match: (p: string) => p === "/" },
  {
    href: "/questions",
    label: "Question Bank",
    icon: MdOutlineQuestionAnswer,
    match: (p: string) => p === "/questions",
  },
  {
    href: "/questions/new",
    label: "Create Questions",
    icon: MdAddCircleOutline,
    match: (p: string) => p === "/questions/new",
  },
  {
    href: "/exams/mock-tests",
    label: "Design Exam",
    icon: MdOutlineAssignment,
    match: (p: string) => p.startsWith("/exams/mock-tests"),
  },
  {
    href: "/exams/templates",
    label: "Templates",
    icon: MdOutlineDescription,
    match: (p: string) => p.startsWith("/exams/templates"),
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
          {expanded && <h2 className="text-xs font-bold bg-zinc-900 p-2 rounded-lg text-zinc-50">DTH Advance Exam Admin</h2>}
          <Sidenav.Toggle onToggle={setExpanded} />
        </Sidenav.Header>
        <Sidenav.Body className="flex-1">
          <Nav>
            {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => (
              <Nav.Item
                key={href}
                as={Link}
                href={href}
                icon={<Icon />}
                active={match(pathname)}
              >
                {label}
              </Nav.Item>
            ))}
          </Nav>
        </Sidenav.Body>
      </Sidenav>
    </Sidebar>
  );
}
