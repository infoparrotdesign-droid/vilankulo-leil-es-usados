export type ProfileInsertInput = {
  userId: string;
  displayName: string;
  phone: string;
  address: string;
  birthDate: string;
};

export function buildProfileInsertPayload(input: ProfileInsertInput) {
  return {
    id: input.userId,
    display_name: input.displayName,
    phone: input.phone,
    address: input.address,
    birth_date: input.birthDate,
  };
}
