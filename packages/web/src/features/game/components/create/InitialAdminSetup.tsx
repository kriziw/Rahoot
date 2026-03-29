import Button from "@mindbuzz/web/features/game/components/Button"
import Form from "@mindbuzz/web/features/game/components/Form"
import Input from "@mindbuzz/web/features/game/components/Input"
import { type KeyboardEvent, useState } from "react"
import toast from "react-hot-toast"

type Props = {
  onSubmit: (_data: { username: string; password: string }) => void
}

const InitialAdminSetup = ({ onSubmit }: Props) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const handleSubmit = () => {
    if (!username.trim()) {
      toast.error("Username is required")

      return
    }

    if (!password.trim()) {
      toast.error("Password is required")

      return
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")

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
      <div className="mb-2 text-center">
        <h1 className="text-2xl font-bold">Set up MindBuzz</h1>
        <p className="text-sm text-gray-500">
          Create the initial admin account for this installation.
        </p>
      </div>

      <Input
        type="text"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Admin username"
      />
      <Input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Password"
      />
      <Input
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Confirm password"
      />
      <Button onClick={handleSubmit}>Create admin account</Button>
    </Form>
  )
}

export default InitialAdminSetup
