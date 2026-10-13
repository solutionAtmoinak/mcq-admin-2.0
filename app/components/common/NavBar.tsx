"use client";

import { NAV_GROUPS } from "@/app/components/common/navGroups";
import Image from 'next/image';
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { FaChartColumn } from "react-icons/fa6";
import { MdOutlineKeyboardDoubleArrowRight } from "react-icons/md";
import { Nav, Sidebar, Sidenav } from "rsuite";

const NAV_OPEN_KEY = 'nav_open'

export default function NavBar() {
  const pathname = usePathname() ?? "";
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const isOpen = localStorage.getItem(NAV_OPEN_KEY)
    if (typeof isOpen === 'undefined' || isOpen === null) {
      setExpanded(true)
    } else {
      setExpanded(!!Number(isOpen))
    }
  }, [])

  const toggleNav = () => {
    localStorage.setItem(NAV_OPEN_KEY, expanded ? '0' : '1')
    setExpanded((prev) => !prev)
  }



  return (
    <Sidebar
      width={expanded ? 240 : 56}
      collapsible
      className="sticky top-0 z-40 h-screen shrink-0 border-r border-zinc-200 bg-white shadow-[1px_0_12px_-6px_rgb(0_0_0/0.12)]"
      style={{ display: "flex", flexDirection: "column", height: "100vh", overflowY: "hidden" }}
    >
      <Sidenav expanded={expanded} className="app-sidenav flex flex-1 flex-col">
        <Sidenav.Header className={`flex items-center gap-x-2 border-b border-zinc-200 h-24 ${expanded ? 'justify-between' : 'justify-center'}`}>
          <div className={expanded ? 'nav-brand-in flex items-center' : 'hidden'}>
            <div className="p-1 shadow bg-indigo-600/10 rounded">
              <Image src='/logo-small.png' className="animate-pulse" width={60} height={60} alt='dth-logo' />
            </div>
            <h1 className="text-xl ltr:ml-1.5 rtl:mr-1.5 font-semibold align-middle lg:inline dark:text-white">DTH LMS PRO</h1>
          </div>
          {/* <Sidenav.Toggle onToggle={toggleNav} /> */}
          <button onClick={toggleNav} className={`translation duration-300 bg-indigo-100 dark:bg-indigo-50/10 text-indigo-500 p-1 rounded-full ${expanded ? 'rotate-180' : ''}`}>
            <MdOutlineKeyboardDoubleArrowRight size={24} />
          </button>
        </Sidenav.Header>
        <Sidenav.Body className="flex-1">
          <Nav>
            <Nav.Item as={Link} href="/" icon={<FaChartColumn className="text-indigo-400 dark:text-indigo-500" />} active={pathname === "/"}>
              Dashboard
            </Nav.Item>
            {/* {NAV_GROUPS.map((group) => (
              <Fragment key={group.eventKey}>
                <div
                  className={`overflow-hidden whitespace-nowrap px-5 text-xs font-medium text-zinc-500 transition-all duration-300 ease-in-out ${expanded ? "max-h-10 py-2 opacity-100" : "max-h-0 py-0 opacity-0"
                    }`}
                >
                  {group.label}
                </div>
                <hr
                  className={`mx-2 border-zinc-200 transition-opacity duration-300 ease-in-out ${expanded ? "opacity-0" : "opacity-100"
                    }`}
                />
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
            ))} */}
            {NAV_GROUPS.map((group) => {
              return (
                <Fragment key={group.eventKey}>
                  {group.items.map((item) => (
                    <Nav.Item
                      key={item.href}
                      as={Link}
                      href={item.href}
                      icon={<item.icon className="text-indigo-400 dark:text-indigo-500" />}
                      active={item.match(pathname)}
                    >
                      {item.label}
                    </Nav.Item>
                  ))}
                </Fragment>
              )
            })}
          </Nav>
        </Sidenav.Body>
      </Sidenav>
    </Sidebar>
  );
}
