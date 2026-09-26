import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    try {
      await register(name, email, password);
     navigate("/workspace");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create your account."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-gray-900">
          Create account
        </h1>

        <p className="mt-2 text-gray-600">
          Create your AI Code Reviewer account.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Name
            </label>

            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Creating account..."
              : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-blue-600 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
};

export default RegisterPage;