import UserGroup from "../models/userGroup.model.js";

const populateMembers = (query) =>
  query.populate("members", "_id username email").lean();

export const listUserGroups = async () =>
  populateMembers(UserGroup.find({}).sort({ createdAt: -1 }));

export const createUserGroup = async ({
  name,
  description,
  memberIds,
  actorId,
}) => {
  if (await UserGroup.exists({ name })) return { error: "GROUP_EXISTS" };

  const group = await UserGroup.create({
    name,
    description,
    members: memberIds,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return populateMembers(UserGroup.findById(group._id));
};

export const updateUserGroupMembers = async ({
  groupId,
  action,
  memberIds,
  actorId,
}) => {
  const group = await UserGroup.findById(groupId);
  if (!group) return null;

  const current = new Set((group.members || []).map((id) => id.toString()));
  if (action === "set") {
    group.members = memberIds;
  } else {
    for (const id of memberIds) {
      if (action === "add") current.add(id);
      else current.delete(id);
    }
    group.members = Array.from(current);
  }

  group.updatedBy = actorId;
  await group.save();
  return populateMembers(UserGroup.findById(group._id));
};
