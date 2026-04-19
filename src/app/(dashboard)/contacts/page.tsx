"use client";

import { useState } from "react";
import { Contact } from "@/types";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactDetail } from "@/components/contacts/ContactDetail";

export default function ContactsPage() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [tableKey, setTableKey] = useState(0);

  return (
    <div className="h-full flex">
      <div
        className={`${
          selectedContact ? "hidden lg:flex" : "flex"
        } flex-1 flex-col`}
      >
        <ContactsTable
          key={tableKey}
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
            onDelete={() => {
              setSelectedContact(null);
              setTableKey((k) => k + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}
