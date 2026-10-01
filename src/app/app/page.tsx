import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listProjects } from "@/lib/db";
import { getCurrentLicense } from "@/lib/license";
import { Notice, PageShell, SectionHeading, Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui";
import { AppHeader } from "@/components/app/AppHeader";
import { CreateProjectForm } from "@/components/app/CreateProjectForm";
import { PLAN_LABELS, formatDate, pluralize } from "@/components/app/format";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

/** Projects list plus the create form. No license cookie sends the visitor to /activate. */
export default async function ProjectsPage() {
  const license = await getCurrentLicense();
  if (!license) redirect("/activate");

  const projects = await listProjects(license.id);

  return (
    <>
      <AppHeader license={license} />
      <main>
        <PageShell className="py-10 md:py-14">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h1>Projects</h1>
            <p className="text-[15px] text-ink-50">{pluralize(projects.length, "project")}</p>
          </div>
          <p className="mt-2 text-[15px] text-ink-70">
            {PLAN_LABELS[license.plan]} plan, {license.email}.
          </p>

          {projects.length === 0 ? (
            <Notice className="mt-8">
              No projects yet. Create the first one below with the brand name and the domain you want to see cited.
            </Notice>
          ) : (
            <Table className="mt-8">
              <Thead>
                <Tr>
                  <Th>Brand</Th>
                  <Th>Domain</Th>
                  <Th>Created</Th>
                  <Th>
                    <span className="sr-only">Open</span>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {projects.map((project) => (
                  <Tr key={project.id}>
                    <Td>
                      <Link href={`/app/projects/${project.id}`} className="font-medium">
                        {project.brandName}
                      </Link>
                    </Td>
                    <Td className="font-mono text-[14px] text-ink-70">{project.domain}</Td>
                    <Td className="whitespace-nowrap text-ink-70">{formatDate(project.createdAt)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      <Link href={`/app/projects/${project.id}`}>Open</Link>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          <section className="mt-14 max-w-xl">
            <SectionHeading>New project</SectionHeading>
            <p className="mt-2 text-[15px] text-ink-70">
              One project per brand and site. You add prompts and run them from the project page.
            </p>
            <CreateProjectForm />
          </section>
        </PageShell>
      </main>
    </>
  );
}
