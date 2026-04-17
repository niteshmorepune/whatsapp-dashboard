"use client";

import { useState } from "react";
import { Contact } from "@/types";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactDetail } from "@/components/contacts/ContactDetail";

export default function ContactsPage() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  return (
    <div className="h-full flex">
      <div
        className={`${
          selectedContact ? "hidden lg:flex" : "flex"
        } flex-1 flex-col`}
      >
        <ContactsTable
          onSelect={setSelectedContact}
          selectedId={selectedContact?.id ?? null}
        />
      </div>

      {selectedContact && (
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <ContactDetail
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
            onUpdate={(updated) => setSelectedContact(updated)}
          />
        </div>
      )}
    </div>
  );
}
