/**
 * What a project is, with no way to open one.
 *
 * `control.ts` reaches `node:crypto` and the SQLite client, so a `"use client"` component that
 * imports one runtime value from it fails the page build. The limits and the shapes live here and
 * are re-exported there, which is the same split as `opinion-input.ts` and `comment-shape.ts`.
 */
export type Role = "owner" | "member";

export type Project = {
  id: string;
  name: string;
  created_at: string;
  /** What this search is for, in one line. Empty until somebody writes it. */
  purpose: string;
  /** The longer note everybody in the project reads. Empty until somebody writes it. */
  description: string;
};

export type Member = { email: string; role: Role; created_at: string };

/** A project as its own member sees it: what it is, what they may do, and how many of them there are. */
export type Mine = Project & { role: Role; owner: string; people: number };

export type Invite = {
  token: string;
  project_id: string;
  project_name: string;
  email: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export const NAME_MAX = 60;
/** What a person calls themselves inside one project. Long enough for a name, short enough for a card. */
export const PERSON_NAME_MAX = 40;
/** One line at a card's width. */
export const PURPOSE_MAX = 80;
export const DESCRIPTION_MAX = 600;
