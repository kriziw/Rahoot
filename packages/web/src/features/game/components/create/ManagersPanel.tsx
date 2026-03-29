import type { ManagerAccount } from "@mindbuzz/common/types/game"
import Button from "@mindbuzz/web/features/game/components/Button"
import Input from "@mindbuzz/web/features/game/components/Input"
import { useState } from "react"
import toast from "react-hot-toast"

type Props = {
  currentManagerId: string
  managers: ManagerAccount[]
  onCreate: (_data: { username: string; password: string }) => void
  onResetPassword: (_data: { managerId: string; password: string }) => void
  onSetDisabled: (_data: { managerId: string; disabled: boolean }) => void
}

const ManagersPanel = ({
  currentManagerId,
  managers,
  onCreate,
  onResetPassword,
  onSetDisabled,
}: Props) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})

  const handleCreate = () => {
    const normalizedUsername = username.trim()
    const normalizedPassword = password.trim()

    if (!normalizedUsername || !normalizedPassword) {
      toast.error("Username and password are required")

      return
    }

    onCreate({
      username: normalizedUsername,
      password: normalizedPassword,
    })
    setUsername("")
    setPassword("")
  }

  const handleResetPassword = (managerId: string) => {
    const nextPassword = passwordDrafts[managerId]?.trim()

    if (!nextPassword) {
      toast.error("Enter a new password first")

      return
    }

    onResetPassword({
      managerId,
      password: nextPassword,
    })
    setPasswordDrafts((current) => ({
      ...current,
      [managerId]: "",
    }))
  }

  return (
    <div className="z-10 flex w-full max-w-5xl flex-col gap-5 rounded-md bg-white p-4 shadow-sm md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Managers</h1>
        <p className="text-sm text-gray-500">
          Create and maintain manager accounts for this installation.
        </p>
      </div>

      <section className="rounded-md bg-gray-50 p-4">
        <div className="mb-3">
          <h2 className="text-lg font-bold">Create manager</h2>
          <p className="text-sm text-gray-500">
            New accounts created here have the `manager` role.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Temporary password"
          />
          <Button className="px-4" onClick={handleCreate} type="button">
            Create manager
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {managers.map((manager) => {
          const isCurrentManager = manager.id === currentManagerId

          return (
            <div
              key={manager.id}
              className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-4"
            >
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold">{manager.username}</h2>
                  <p className="text-sm text-gray-500">
                    Role: {manager.role} | Status:{" "}
                    {manager.disabledAt ? "Disabled" : "Active"}
                  </p>
                </div>

                {!isCurrentManager && (
                  <Button
                    type="button"
                    className={manager.disabledAt ? "px-4" : "bg-white px-4 !text-black"}
                    onClick={() =>
                      onSetDisabled({
                        managerId: manager.id,
                        disabled: !manager.disabledAt,
                      })
                    }
                  >
                    {manager.disabledAt ? "Enable" : "Disable"}
                  </Button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  type="password"
                  value={passwordDrafts[manager.id] ?? ""}
                  onChange={(event) =>
                    setPasswordDrafts((current) => ({
                      ...current,
                      [manager.id]: event.target.value,
                    }))
                  }
                  placeholder="New password"
                />
                <Button
                  type="button"
                  className="px-4"
                  onClick={() => handleResetPassword(manager.id)}
                >
                  Reset password
                </Button>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default ManagersPanel
