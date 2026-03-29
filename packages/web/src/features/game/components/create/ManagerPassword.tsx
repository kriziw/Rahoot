import Button from "@mindbuzz/web/features/game/components/Button"
import Form from "@mindbuzz/web/features/game/components/Form"
import Input from "@mindbuzz/web/features/game/components/Input"
import { type KeyboardEvent, useState } from "react"

type Props = {
  onSubmit: (_credentials: { username: string; password: string }) => void
  onSsoLogin?: () => void
  showSsoButton?: boolean
  isBusy?: boolean
}

const ManagerPassword = ({
  onSubmit,
  onSsoLogin,
  showSsoButton = false,
  isBusy = false,
}: Props) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = () => {
    if (isBusy) {
      return
    }

    onSubmit({
      username,
      password,
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSubmit()
    }
  }

  return (
    <Form>
      <Input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isBusy}
        placeholder="Username"
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isBusy}
        placeholder="Password"
      />
      <Button disabled={isBusy} onClick={handleSubmit}>
        {isBusy ? "Completing sign in..." : "Sign in"}
      </Button>
      {showSsoButton && onSsoLogin && (
        <>
          <div className="text-center text-sm font-semibold text-gray-500">or</div>
          <Button
            className="bg-white !text-black"
            disabled={isBusy}
            onClick={onSsoLogin}
            type="button"
          >
            Sign in with SSO
          </Button>
        </>
      )}
    </Form>
  )
}

export default ManagerPassword

